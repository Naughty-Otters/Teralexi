import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { normalize, extname } from 'node:path'
import { createLogger } from '@main/logger'
import { LspClient } from './lsp-client'
import { matchLanguageServer, detectWorkspaceServers, LANGUAGE_SERVERS, type LanguageServerDef } from './language-servers'
import { findWorkspaceSeedFile } from './workspace-seed'
import { buildDiagnosticReport, type DiagnosticReport } from './diagnostic-format'
import type { LspDiagnostic } from './types'
import {
  hoverToText,
  normalizeDocumentSymbols,
  normalizeLocations,
  normalizeWorkspaceSymbols,
  type DisplayLocation,
  type DisplaySymbol,
  type DisplayWorkspaceSymbol,
} from './symbol-format'

export type SymbolOperation =
  | 'definition'
  | 'references'
  | 'hover'
  | 'document_symbols'
  | 'workspace_symbols'
  | 'implementation'

export type SymbolQueryResult =
  | { ok: false; error: string }
  | { ok: true; operation: 'definition' | 'references' | 'implementation'; locations: DisplayLocation[] }
  | { ok: true; operation: 'hover'; hover: string }
  | { ok: true; operation: 'document_symbols'; symbols: DisplaySymbol[] }
  | { ok: true; operation: 'workspace_symbols'; symbols: DisplayWorkspaceSymbol[] }

const POSITION_OPS = new Set<SymbolOperation>([
  'definition',
  'references',
  'hover',
  'implementation',
])

const LSP_METHOD: Record<SymbolOperation, string> = {
  definition: 'textDocument/definition',
  references: 'textDocument/references',
  hover: 'textDocument/hover',
  implementation: 'textDocument/implementation',
  document_symbols: 'textDocument/documentSymbol',
  workspace_symbols: 'workspace/symbol',
}

const log = createLogger('agent.lsp.manager')

/** Overall budget for one diagnostics request, including first-time server spawn. */
const OVERALL_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

/**
 * Owns long-lived language-server connections keyed by `workspaceRoot::serverId`.
 *
 * All operations are best-effort: any failure (missing binary, crash, timeout)
 * yields an empty report so file edits are never blocked or broken.
 */
class LspManager {
  private readonly clients = new Map<string, LspClient>()
  private readonly starting = new Map<string, Promise<LspClient | null>>()
  /** Commands known to be missing on PATH — don't retry spawning them. */
  private readonly unavailableCommands = new Set<string>()
  private editorContentResolver:
    | ((workspaceRoot: string, absPath: string) => string | null)
    | null = null
  private diagnosticsHandler:
    | ((
        workspaceRoot: string,
        absPath: string,
        diagnostics: LspDiagnostic[],
      ) => void)
    | null = null
  private readonly wiredClients = new WeakSet<LspClient>()
  private readonly clientWorkspaceRoots = new WeakMap<LspClient, string>()
  /** Servers warmed with at least one open document for workspace/symbol. */
  private readonly symbolSearchWarmed = new Set<string>()

  private key(workspaceRoot: string, serverId: string): string {
    return `${workspaceRoot}::${serverId}`
  }

  setEditorContentResolver(
    resolver: (workspaceRoot: string, absPath: string) => string | null,
  ): void {
    this.editorContentResolver = resolver
  }

  setDiagnosticsHandler(
    handler: (
      workspaceRoot: string,
      absPath: string,
      diagnostics: LspDiagnostic[],
    ) => void,
  ): void {
    this.diagnosticsHandler = handler
    for (const [key, client] of this.clients) {
      const idx = key.indexOf('::')
      const workspaceRoot = idx >= 0 ? key.slice(0, idx) : ''
      this.wireClientNotifications(client, workspaceRoot)
    }
  }

  private wireClientNotifications(client: LspClient, workspaceRoot: string): void {
    if (this.wiredClients.has(client) || !workspaceRoot) return
    this.wiredClients.add(client)
    this.clientWorkspaceRoots.set(client, workspaceRoot)
    client.onNotification((method, params) => {
      if (method !== 'textDocument/publishDiagnostics' || !this.diagnosticsHandler) {
        return
      }
      const payload = params as { uri?: string; diagnostics?: LspDiagnostic[] } | undefined
      if (!payload?.uri) return
      try {
        const absPath = normalize(fileURLToPath(payload.uri))
        this.diagnosticsHandler(workspaceRoot, absPath, payload.diagnostics ?? [])
      } catch {
        /* ignore bad URIs */
      }
    })
  }

  private async readDocumentText(
    absFilePath: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    const owned = this.editorContentResolver?.(workspaceRoot, absFilePath)
    if (owned != null) return owned
    try {
      return await readFile(absFilePath, 'utf8')
    } catch {
      return null
    }
  }

  async syncEditorDocument(
    workspaceRoot: string,
    absFilePath: string,
    text: string,
    languageId: string,
  ): Promise<void> {
    const match = matchLanguageServer(absFilePath)
    if (!match) return

    const client = await this.getClient(workspaceRoot, match.server, () =>
      new LspClient(match.server, workspaceRoot),
    )
    if (!client) return

    this.wireClientNotifications(client, workspaceRoot)
    client.syncDocument(absFilePath, text, languageId)
  }

  async closeEditorDocument(
    workspaceRoot: string,
    absFilePath: string,
  ): Promise<void> {
    const match = matchLanguageServer(absFilePath)
    if (!match) return

    const client = this.clients.get(this.key(workspaceRoot, match.server.id))
    client?.closeDocument(absFilePath)
  }

  async editorLspRequest(
    workspaceRoot: string,
    absFilePath: string,
    text: string,
    languageId: string,
    method: string,
    params: unknown,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    const match = matchLanguageServer(absFilePath)
    if (!match) {
      return { ok: false, error: `No language server is configured for ${absFilePath}.` }
    }

    const client = await this.getClient(workspaceRoot, match.server, () =>
      new LspClient(match.server, workspaceRoot),
    )
    if (!client) {
      return {
        ok: false,
        error: `Language server "${match.server.command}" is not available.`,
      }
    }

    this.wireClientNotifications(client, workspaceRoot)
    client.syncDocument(absFilePath, text, languageId)

    try {
      const result = await client.lspRequest(method, params)
      return { ok: true, result: result ?? null }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  private async getClient(
    workspaceRoot: string,
    serverDef: { id: string; command: string },
    create: () => LspClient,
  ): Promise<LspClient | null> {
    if (this.unavailableCommands.has(serverDef.command)) return null

    const key = this.key(workspaceRoot, serverDef.id)
    const existing = this.clients.get(key)
    if (existing) return existing

    const inFlight = this.starting.get(key)
    if (inFlight) return inFlight

    const startPromise = (async () => {
      const client = create()
      try {
        await client.start()
        this.clients.set(key, client)
        this.wireClientNotifications(client, workspaceRoot)
        log.info('Language server started', { server: serverDef.id, workspaceRoot })
        return client
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        if (code === 'ENOENT') {
          this.unavailableCommands.add(serverDef.command)
          log.info('Language server not installed; skipping', {
            server: serverDef.id,
            command: serverDef.command,
          })
        } else {
          log.warn('Language server failed to start', { server: serverDef.id, err })
        }
        client.dispose()
        return null
      } finally {
        this.starting.delete(key)
      }
    })()

    this.starting.set(key, startPromise)
    return startPromise
  }

  /**
   * Compute a diagnostics report for a freshly-edited file. Returns an empty
   * report when no server matches, the binary is missing, or anything times out.
   */
  async getDiagnosticReport(
    absFilePath: string,
    workspaceRoot: string,
  ): Promise<DiagnosticReport> {
    const empty: DiagnosticReport = { errorCount: 0, warningCount: 0, block: '' }

    const match = matchLanguageServer(absFilePath)
    if (!match) return empty

    return withTimeout(
      (async () => {
        const client = await this.getClient(workspaceRoot, match.server, () =>
          new LspClient(match.server, workspaceRoot),
        )
        if (!client) return empty

        const text = await this.readDocumentText(absFilePath, workspaceRoot)
        if (text == null) return empty

        const diagnostics = await client.getDiagnostics(
          absFilePath,
          text,
          match.languageId,
        )
        return buildDiagnosticReport(absFilePath, workspaceRoot, diagnostics)
      })(),
      OVERALL_TIMEOUT_MS,
      empty,
    )
  }

  /**
   * Answer a symbol-intelligence query (definition, references, hover, …).
   * Best-effort: returns a structured error rather than throwing.
   */
  async querySymbols(params: {
    operation: SymbolOperation
    absFilePath: string
    workspaceRoot: string
    /** 1-based, editor-style. Required for position operations. */
    line?: number
    character?: number
    query?: string
  }): Promise<SymbolQueryResult> {
    const { operation, absFilePath, workspaceRoot } = params

    const match = matchLanguageServer(absFilePath)
    if (!match) {
      return { ok: false, error: `No language server is configured for ${absFilePath}.` }
    }

    if (POSITION_OPS.has(operation) && (params.line == null || params.character == null)) {
      return { ok: false, error: `Operation "${operation}" requires line and character.` }
    }

    const fallback: SymbolQueryResult = {
      ok: false,
      error: `LSP ${operation} timed out or returned nothing.`,
    }

    return withTimeout(
      (async (): Promise<SymbolQueryResult> => {
        const client = await this.getClient(workspaceRoot, match.server, () =>
          new LspClient(match.server, workspaceRoot),
        )
        if (!client) {
          return {
            ok: false,
            error: `Language server "${match.server.command}" is not available. Install it to enable code intelligence.`,
          }
        }

        const text = await this.readDocumentText(absFilePath, workspaceRoot)
        if (text == null) {
          return { ok: false, error: `Cannot read file: ${absFilePath}` }
        }

        const uri = await client.openDocument(absFilePath, text, match.languageId)

        const requestParams =
          operation === 'workspace_symbols'
            ? { query: params.query ?? '' }
            : operation === 'references'
              ? {
                  textDocument: { uri },
                  position: { line: params.line! - 1, character: params.character! - 1 },
                  context: { includeDeclaration: true },
                }
              : operation === 'document_symbols'
                ? { textDocument: { uri } }
                : {
                    textDocument: { uri },
                    position: { line: params.line! - 1, character: params.character! - 1 },
                  }

        const raw = await client.lspRequest(LSP_METHOD[operation], requestParams)

        switch (operation) {
          case 'definition':
          case 'references':
          case 'implementation':
            return { ok: true, operation, locations: normalizeLocations(raw, workspaceRoot) }
          case 'hover':
            return { ok: true, operation, hover: hoverToText(raw) }
          case 'document_symbols':
            return { ok: true, operation, symbols: normalizeDocumentSymbols(raw) }
          case 'workspace_symbols':
            return {
              ok: true,
              operation,
              symbols: normalizeWorkspaceSymbols(raw, workspaceRoot),
            }
        }
      })(),
      OVERALL_TIMEOUT_MS,
      fallback,
    )
  }

  /**
   * Search symbols across the workspace via `workspace/symbol` on each relevant
   * language server. Best-effort merge from all servers that can start.
   */
  async queryWorkspaceSymbols(
    workspaceRoot: string,
    query: string,
    options?: { conversationId?: string },
  ): Promise<
    | { ok: true; symbols: DisplayWorkspaceSymbol[] }
    | { ok: false; error: string }
  > {
    const root = workspaceRoot.trim()
    if (!root) return { ok: false, error: 'workspaceRoot is required.' }

    const detected = detectWorkspaceServers(root)
    const servers =
      detected.length > 0 ? detected : LANGUAGE_SERVERS.filter((s) => s.id === 'typescript' || s.id === 'pyright')

    const merged: DisplayWorkspaceSymbol[] = []
    const seen = new Set<string>()
    let startedAny = false

    for (const server of servers) {
      const client = await this.getClient(root, server, () =>
        new LspClient(server, root),
      )
      if (!client) continue
      startedAny = true
      this.wireClientNotifications(client, root)

      try {
        await this.warmForWorkspaceSymbolSearch(
          client,
          server,
          root,
          options?.conversationId,
        )
        const raw = await client.lspRequest('workspace/symbol', {
          query: query.trim(),
        })
        for (const sym of normalizeWorkspaceSymbols(raw, root)) {
          const key = `${sym.path}:${sym.line}:${sym.character}:${sym.name}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(sym)
        }
      } catch (err) {
        log.debug('workspace/symbol failed', { server: server.id, err })
      }
    }

    if (!startedAny) {
      return {
        ok: false,
        error: 'No language server is available for workspace symbol search.',
      }
    }

    merged.sort((a, b) => {
      const q = query.trim().toLowerCase()
      if (q) {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        const aExact = aName === q ? 0 : aName.startsWith(q) ? 1 : 2
        const bExact = bName === q ? 0 : bName.startsWith(q) ? 1 : 2
        if (aExact !== bExact) return aExact - bExact
      }
      return a.name.localeCompare(b.name) || a.path.localeCompare(b.path)
    })

    return { ok: true, symbols: merged.slice(0, 50) }
  }

  /**
   * TypeScript (and some other servers) return "No Project" for workspace/symbol
   * until at least one project file is open. Open editor buffers first, else a
   * discovered seed file, and poll until the server accepts workspace/symbol.
   */
  private async warmForWorkspaceSymbolSearch(
    client: LspClient,
    server: LanguageServerDef,
    workspaceRoot: string,
    conversationId?: string,
  ): Promise<void> {
    const warmKey = this.key(workspaceRoot, server.id)
    if (this.symbolSearchWarmed.has(warmKey)) return

    const openCandidates = await this.collectSymbolWarmCandidates(
      workspaceRoot,
      server,
      conversationId,
    )
    for (const absPath of openCandidates) {
      const match = matchLanguageServer(absPath)
      if (!match || match.server.id !== server.id) continue
      const text = await this.readDocumentText(absPath, workspaceRoot)
      if (text == null) continue
      await client.openDocument(absPath, text, match.languageId)
    }

    if (!client.hasOpenDocuments()) {
      const seed = findWorkspaceSeedFile(workspaceRoot, server)
      if (seed) {
        const match = matchLanguageServer(seed)
        const text = await this.readDocumentText(seed, workspaceRoot)
        if (match && text != null) {
          await client.openDocument(seed, text, match.languageId)
        }
      }
    }

    if (client.hasOpenDocuments()) {
      await this.waitForWorkspaceSymbolReady(client)
      this.symbolSearchWarmed.add(warmKey)
    }
  }

  private async collectSymbolWarmCandidates(
    workspaceRoot: string,
    server: LanguageServerDef,
    conversationId?: string,
  ): Promise<string[]> {
    const root = normalize(workspaceRoot)
    const exts = new Set(Object.keys(server.extensions))
    const out: string[] = []
    const seen = new Set<string>()

    const add = (absPath: string) => {
      const normalized = normalize(absPath)
      if (seen.has(normalized)) return
      if (!exts.has(extname(normalized).toLowerCase())) return
      seen.add(normalized)
      out.push(normalized)
    }

    if (conversationId?.trim()) {
      try {
        const { getEditorLspBridge } = await import('./editor-lsp-bridge')
        for (const doc of getEditorLspBridge().listOpenDocumentsForWorkspace(root)) {
          add(doc.absPath)
        }
      } catch {
        /* bridge unavailable */
      }
    }

    const seed = findWorkspaceSeedFile(root, server)
    if (seed) add(seed)
    return out
  }

  private async waitForWorkspaceSymbolReady(
    client: LspClient,
    timeoutMs = 6000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const raw = await client.lspRequest('workspace/symbol', { query: '' }, 2500)
        if (Array.isArray(raw)) return
      } catch {
        /* project graph still loading */
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  /**
   * Proactively start the language servers relevant to a workspace (by marker
   * files), so they're warm before the first edit/query instead of paying a
   * cold start mid-task. Fire-and-forget and best-effort — call on workspace
   * activation. No-op for servers already started or known unavailable.
   */
  prewarm(workspaceRoot: string): void {
    if (!workspaceRoot?.trim()) return
    for (const server of detectWorkspaceServers(workspaceRoot)) {
      void this.getClient(workspaceRoot, server, () =>
        new LspClient(server, workspaceRoot),
      ).then(
        (client) => {
          if (client) {
            log.info('Pre-warmed language server', { server: server.id, workspaceRoot })
          }
        },
        () => {
          /* getClient already logs + caches failures */
        },
      )
    }
  }

  /** Kill every language server. Called on app quit. */
  closeAll(): void {
    for (const [, client] of this.clients) client.dispose()
    this.clients.clear()
    this.starting.clear()
    this.symbolSearchWarmed.clear()
  }
}

/**
 * Shared on globalThis (not a module-local variable) so the singleton is the
 * SAME instance across the main bundle and the separately-esbuilt toolSet
 * bundle. Otherwise the `lsp` tool and edit-time diagnostics would each spawn
 * their own language servers, and `closeAll()` on quit would only reap one set
 * (the others would leak as orphan processes). Mirrors the sandbox-root global.
 */
const LSP_MANAGER_GLOBAL_KEY = '__OTTER_LSP_MANAGER__' as const

export function getLspManager(): LspManager {
  const g = globalThis as unknown as Record<string, unknown>
  let manager = g[LSP_MANAGER_GLOBAL_KEY] as LspManager | undefined
  if (!manager) {
    manager = new LspManager()
    g[LSP_MANAGER_GLOBAL_KEY] = manager
  }
  return manager
}
