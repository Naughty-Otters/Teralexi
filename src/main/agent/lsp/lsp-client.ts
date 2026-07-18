import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createLogger } from '@main/logger'
import { encodeMessage, MessageBuffer } from './json-rpc'
import type { JsonRpcMessage, LspDiagnostic } from './types'
import {
  buildServerPath,
  resolveBundledTsserverPath,
  resolveServerCommand,
  type LanguageServerDef,
} from './language-servers'

const log = createLogger('agent.lsp.client')

const INITIALIZE_TIMEOUT_MS = 15_000
const DIAGNOSTICS_TIMEOUT_MS = 6_000
const SYMBOL_TIMEOUT_MS = 8_000

/** Server→client requests we auto-answer so the server never blocks on us. */
const NULL_REPLY_METHODS = new Set([
  'client/registerCapability',
  'client/unregisterCapability',
  'window/workDoneProgress/create',
  'workspace/semanticTokens/refresh',
  'workspace/inlayHint/refresh',
  'workspace/diagnostic/refresh',
  'workspace/codeLens/refresh',
])

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
}

export type LspNotificationListener = (
  method: string,
  params: unknown,
) => void

/**
 * A single language-server connection scoped to one workspace root.
 *
 * Holds a long-lived child process and tracks open documents so re-edits send
 * `didChange` rather than a duplicate `didOpen`.
 */
export class LspClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private readonly reader = new MessageBuffer()
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly diagnosticsByUri = new Map<string, LspDiagnostic[]>()
  private readonly publishWaiters = new Map<string, Array<() => void>>()
  private readonly openVersions = new Map<string, number>()
  private readonly notificationListeners = new Set<LspNotificationListener>()
  private started = false
  private disposed = false

  constructor(
    private readonly def: LanguageServerDef,
    private readonly workspaceRoot: string,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    const command = resolveServerCommand(this.def, this.workspaceRoot)
    const proc = spawn(command, this.def.args, {
      cwd: this.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Augment PATH so a project-local server and its `env node` shebang
      // resolve even when Electron's PATH is minimal.
      env: { ...process.env, PATH: buildServerPath(this.workspaceRoot) },
    })
    this.proc = proc

    await new Promise<void>((resolve, reject) => {
      const onSpawnError = (err: Error) => reject(err)
      proc.once('error', onSpawnError)
      proc.once('spawn', () => {
        proc.off('error', onSpawnError)
        resolve()
      })
    })

    proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk))
    proc.stderr.on('data', () => {
      /* language servers are chatty on stderr; ignore */
    })
    proc.on('exit', (code) => {
      if (!this.disposed) {
        log.warn('Language server exited unexpectedly', {
          server: this.def.id,
          code,
        })
      }
      this.failAllPending(new Error('Language server exited'))
    })

    await this.initialize()
  }

  private async initialize(): Promise<void> {
    const tsserverPath =
      this.def.id === 'typescript' ? resolveBundledTsserverPath() : null
    const result = this.request(
      'initialize',
      {
        processId: process.pid,
        rootUri: pathToFileURL(this.workspaceRoot).toString(),
        workspaceFolders: [
          {
            uri: pathToFileURL(this.workspaceRoot).toString(),
            name: 'workspace',
          },
        ],
        capabilities: {
          textDocument: {
            synchronization: { didSave: false, dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: false },
            definition: { dynamicRegistration: false, linkSupport: true },
            references: { dynamicRegistration: false },
            hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
            documentSymbol: {
              dynamicRegistration: false,
              hierarchicalDocumentSymbolSupport: true,
            },
            implementation: { dynamicRegistration: false, linkSupport: true },
            completion: {
              dynamicRegistration: false,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
              },
            },
          },
          workspace: {
            configuration: true,
            workspaceFolders: true,
            symbol: { dynamicRegistration: false },
          },
        },
        clientInfo: { name: 'Teralexi', version: '1.0.0' },
        ...(tsserverPath
          ? {
              // Prefer the workspace TypeScript when valid; fall back to the
              // app-bundled tsserver (needed when `typescript` is typescript6
              // without tsserver.js, or the workspace has no typescript at all).
              initializationOptions: {
                tsserver: { fallbackPath: tsserverPath },
              },
            }
          : {}),
      },
      INITIALIZE_TIMEOUT_MS,
    )
    await result
    this.notify('initialized', {})
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.failAllPending(new Error('LSP client disposed'))
    const proc = this.proc
    if (!proc) return
    try {
      this.notify('shutdown', undefined)
      this.notify('exit', undefined)
    } catch {
      /* ignore */
    }
    // Give it a beat to exit cleanly, then force-kill.
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
    }, 500)
  }

  // ── Public: diagnostics ────────────────────────────────────────────────────

  /**
   * Open or update `absPath` with `text` and return the latest diagnostics the
   * server publishes for it. Never throws — returns [] on any failure/timeout.
   */
  async getDiagnostics(
    absPath: string,
    text: string,
    languageId: string,
  ): Promise<LspDiagnostic[]> {
    if (this.disposed || !this.proc) return []
    try {
      const uri = this.ensureDocumentOpen(absPath, text, languageId)
      await this.waitForPublish(uri, DIAGNOSTICS_TIMEOUT_MS)
      return this.diagnosticsByUri.get(uri) ?? []
    } catch (err) {
      log.debug('getDiagnostics failed', { server: this.def.id, err })
      return []
    }
  }

  // ── Public: symbol intelligence ────────────────────────────────────────────

  /** Open (or update) a document so the server can answer queries about it. */
  async openDocument(
    absPath: string,
    text: string,
    languageId: string,
  ): Promise<string> {
    if (this.disposed || !this.proc) throw new Error('LSP client not running')
    return this.ensureDocumentOpen(absPath, text, languageId)
  }

  /** Sync editor buffer content (open or full-buffer didChange). */
  syncDocument(absPath: string, text: string, languageId: string): string | null {
    if (this.disposed || !this.proc) return null
    return this.ensureDocumentOpen(absPath, text, languageId)
  }

  /** Close a document in the language server. */
  closeDocument(absPath: string): void {
    if (this.disposed || !this.proc) return
    const uri = pathToFileURL(absPath).toString()
    if (!this.openVersions.has(uri)) return
    this.openVersions.delete(uri)
    this.diagnosticsByUri.delete(uri)
    this.notify('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  /** Subscribe to server→client notifications (e.g. publishDiagnostics). */
  onNotification(listener: LspNotificationListener): () => void {
    this.notificationListeners.add(listener)
    return () => this.notificationListeners.delete(listener)
  }

  /** Whether any document has been opened on this connection. */
  hasOpenDocuments(): boolean {
    return this.openVersions.size > 0
  }

  /** Send an arbitrary LSP request and return its raw result (or null). */
  async lspRequest(
    method: string,
    params: unknown,
    timeoutMs = SYMBOL_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.disposed || !this.proc) return null
    return this.request(method, params, timeoutMs)
  }

  private ensureDocumentOpen(
    absPath: string,
    text: string,
    languageId: string,
  ): string {
    const uri = pathToFileURL(absPath).toString()
    const openVersion = this.openVersions.get(uri)
    if (openVersion == null) {
      this.openVersions.set(uri, 1)
      this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      })
    } else {
      const version = openVersion + 1
      this.openVersions.set(uri, version)
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      })
    }
    return uri
  }

  // ── Incoming message handling ──────────────────────────────────────────────

  private onData(chunk: Buffer): void {
    for (const message of this.reader.push(chunk)) {
      this.handleMessage(message)
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Response to one of our requests.
    if (message.id != null && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(message.id as number)
      if (pending) {
        this.pending.delete(message.id as number)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
      }
      return
    }

    // Server→client request (has id + method): must reply or the server blocks.
    if (message.id != null && message.method) {
      this.replyToServerRequest(message)
      return
    }

    // Notification.
    if (message.method) {
      if (message.method === 'textDocument/publishDiagnostics') {
        const params = message.params as
          | { uri?: string; diagnostics?: LspDiagnostic[] }
          | undefined
        if (params?.uri) {
          this.diagnosticsByUri.set(params.uri, params.diagnostics ?? [])
          this.flushWaiters(params.uri)
        }
      }
      for (const listener of this.notificationListeners) {
        listener(message.method, message.params)
      }
    }
  }

  private replyToServerRequest(message: JsonRpcMessage): void {
    if (message.method === 'workspace/configuration') {
      const items = (message.params as { items?: unknown[] })?.items ?? []
      this.respond(message.id!, items.map(() => null))
      return
    }
    if (NULL_REPLY_METHODS.has(message.method ?? '')) {
      this.respond(message.id!, null)
      return
    }
    // Default: answer null so nothing blocks.
    this.respond(message.id!, null)
  }

  // ── Transport primitives ────────────────────────────────────────────────────

  private request(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer)
          resolve(r)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  private respond(id: number | string, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result })
  }

  private send(message: JsonRpcMessage): void {
    if (!this.proc || this.proc.killed) return
    try {
      this.proc.stdin.write(encodeMessage(message))
    } catch (err) {
      log.debug('LSP write failed', { server: this.def.id, err })
    }
  }

  // ── publishDiagnostics waiting ──────────────────────────────────────────────

  private waitForPublish(uri: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const timer = setTimeout(done, timeoutMs)
      const waiter = () => {
        clearTimeout(timer)
        done()
      }
      const list = this.publishWaiters.get(uri) ?? []
      list.push(waiter)
      this.publishWaiters.set(uri, list)
    })
  }

  private flushWaiters(uri: string): void {
    const list = this.publishWaiters.get(uri)
    if (!list?.length) return
    this.publishWaiters.delete(uri)
    for (const waiter of list) waiter()
  }

  private failAllPending(err: Error): void {
    for (const [, pending] of this.pending) pending.reject(err)
    this.pending.clear()
    for (const [uri] of this.publishWaiters) this.flushWaiters(uri)
  }
}
