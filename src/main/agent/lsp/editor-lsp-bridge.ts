import { normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebContents } from 'electron'
import { createLogger } from '@main/logger'
import { resolveUserProjectPath } from '@main/agent/sandbox'
import { webContentSend } from '@main/services/web-content-send'
import { getLspManager } from './lsp-manager'
import { isLspSupportedFile, matchLanguageServer } from './language-servers'
import type { LspDiagnostic } from './types'

const log = createLogger('agent.lsp.editor-bridge')

const SYNC_DEBOUNCE_MS = 200

type OwnedDocument = {
  relativePath: string
  absPath: string
  content: string
  languageId: string
  syncTimer: ReturnType<typeof setTimeout> | null
}

type EditorSession = {
  conversationId: string
  workspaceRoot: string
  webContents: WebContents | null
  documents: Map<string, OwnedDocument>
}

export type EditorLspNotificationPayload = {
  conversationId: string
  relativePath: string
  method: string
  params: unknown
}

class EditorLspBridge {
  private readonly sessions = new Map<string, EditorSession>()
  /** workspaceRoot::relativePath → latest editor buffer (any session). */
  private readonly ownedContent = new Map<string, string>()

  startSession(
    conversationId: string,
    workspaceRoot: string,
    webContents: WebContents | null,
  ): { ok: true } | { ok: false; error: string } {
    const id = conversationId.trim()
    const root = workspaceRoot.trim()
    if (!id) return { ok: false, error: 'conversationId is required.' }
    if (!root) return { ok: false, error: 'workspaceRoot is required.' }

    this.sessions.set(id, {
      conversationId: id,
      workspaceRoot: normalize(root),
      webContents,
      documents: new Map(),
    })

    getLspManager().prewarm(normalize(root))
    return { ok: true }
  }

  stopSession(conversationId: string): void {
    const session = this.sessions.get(conversationId.trim())
    if (!session) return

    for (const doc of session.documents.values()) {
      if (doc.syncTimer) clearTimeout(doc.syncTimer)
      this.untrackOwnedContent(session.workspaceRoot, doc.relativePath)
      void getLspManager().closeEditorDocument(session.workspaceRoot, doc.absPath)
    }

    this.sessions.delete(session.conversationId)
  }

  queueSyncDocument(
    conversationId: string,
    relativePath: string,
    content: string,
    languageId: string,
  ): { ok: true } | { ok: false; error: string } {
    const session = this.sessions.get(conversationId.trim())
    if (!session) return { ok: false, error: 'Editor LSP session not started.' }

    const rel = relativePath.replace(/\\/g, '/').trim()
    if (!rel) return { ok: false, error: 'relativePath is required.' }

    const absPath = resolveUserProjectPath(session.workspaceRoot, rel)
    if (!isLspSupportedFile(absPath)) return { ok: true }

    const match = matchLanguageServer(absPath)
    const langId = languageId.trim() || match?.languageId || 'plaintext'

    let doc = session.documents.get(rel)
    if (!doc) {
      doc = {
        relativePath: rel,
        absPath,
        content,
        languageId: langId,
        syncTimer: null,
      }
      session.documents.set(rel, doc)
    } else {
      doc.content = content
      doc.languageId = langId
    }

    this.trackOwnedContent(session.workspaceRoot, rel, content)

    if (doc.syncTimer) clearTimeout(doc.syncTimer)
    doc.syncTimer = setTimeout(() => {
      doc!.syncTimer = null
      void getLspManager().syncEditorDocument(
        session.workspaceRoot,
        doc!.absPath,
        doc!.content,
        doc!.languageId,
      )
    }, SYNC_DEBOUNCE_MS)

    return { ok: true }
  }

  closeDocument(
    conversationId: string,
    relativePath: string,
  ): { ok: true } | { ok: false; error: string } {
    const session = this.sessions.get(conversationId.trim())
    if (!session) return { ok: false, error: 'Editor LSP session not started.' }

    const rel = relativePath.replace(/\\/g, '/').trim()
    const doc = session.documents.get(rel)
    if (!doc) return { ok: true }

    if (doc.syncTimer) clearTimeout(doc.syncTimer)
    session.documents.delete(rel)
    this.untrackOwnedContent(session.workspaceRoot, rel)
    void getLspManager().closeEditorDocument(session.workspaceRoot, doc.absPath)
    return { ok: true }
  }

  async request(
    conversationId: string,
    relativePath: string,
    method: string,
    params: unknown,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    const session = this.sessions.get(conversationId.trim())
    if (!session) return { ok: false, error: 'Editor LSP session not started.' }

    const rel = relativePath.replace(/\\/g, '/').trim()
    const doc = session.documents.get(rel)
    if (!doc) return { ok: false, error: 'Document is not open in the editor.' }

    return getLspManager().editorLspRequest(
      session.workspaceRoot,
      doc.absPath,
      doc.content,
      doc.languageId,
      method,
      params,
    )
  }

  /** Open editor documents for a workspace (used to warm LSP before symbol search). */
  listOpenDocumentsForWorkspace(
    workspaceRoot: string,
  ): Array<{ absPath: string; languageId: string }> {
    const root = normalize(workspaceRoot)
    const out: Array<{ absPath: string; languageId: string }> = []
    for (const session of this.sessions.values()) {
      if (session.workspaceRoot !== root) continue
      for (const doc of session.documents.values()) {
        out.push({ absPath: doc.absPath, languageId: doc.languageId })
      }
    }
    return out
  }

  /** Latest editor buffer when a file is open in any session, else null. */
  getOwnedContent(workspaceRoot: string, absPath: string): string | null {
    const root = normalize(workspaceRoot)
    const normalizedAbs = normalize(absPath)
    for (const session of this.sessions.values()) {
      if (session.workspaceRoot !== root) continue
      for (const doc of session.documents.values()) {
        if (normalize(doc.absPath) === normalizedAbs) {
          return doc.content
        }
      }
    }
    return null
  }

  publishDiagnostics(
    workspaceRoot: string,
    absPath: string,
    diagnostics: LspDiagnostic[],
  ): void {
    const root = normalize(workspaceRoot)
    const normalizedAbs = normalize(absPath)

    for (const session of this.sessions.values()) {
      if (session.workspaceRoot !== root) continue
      for (const doc of session.documents.values()) {
        if (normalize(doc.absPath) !== normalizedAbs) continue
        const wc = session.webContents
        if (!wc || wc.isDestroyed()) continue

        webContentSend.EditorLspNotification(wc, {
          conversationId: session.conversationId,
          relativePath: doc.relativePath,
          method: 'textDocument/publishDiagnostics',
          params: { uri: absPath, diagnostics },
        })
      }
    }
  }

  private trackOwnedContent(
    workspaceRoot: string,
    relativePath: string,
    content: string,
  ): void {
    this.ownedContent.set(`${normalize(workspaceRoot)}::${relativePath}`, content)
  }

  private untrackOwnedContent(workspaceRoot: string, relativePath: string): void {
    this.ownedContent.delete(`${normalize(workspaceRoot)}::${relativePath}`)
  }
}

const EDITOR_LSP_BRIDGE_GLOBAL_KEY = '__TERALEXI_EDITOR_LSP_BRIDGE__' as const

export function getEditorLspBridge(): EditorLspBridge {
  const g = globalThis as unknown as Record<string, unknown>
  let bridge = g[EDITOR_LSP_BRIDGE_GLOBAL_KEY] as EditorLspBridge | undefined
  if (!bridge) {
    bridge = new EditorLspBridge()
    g[EDITOR_LSP_BRIDGE_GLOBAL_KEY] = bridge
    const manager = getLspManager()
    manager.setEditorContentResolver((workspaceRoot, absPath) =>
      bridge!.getOwnedContent(workspaceRoot, absPath),
    )
    manager.setDiagnosticsHandler((workspaceRoot, absPath, diagnostics) =>
      bridge!.publishDiagnostics(workspaceRoot, absPath, diagnostics),
    )
  }
  return bridge
}

/** Resolve a workspace-relative path for IPC handlers. */
export function resolveEditorRelativePath(
  workspaceRoot: string,
  relativePath: string,
): string {
  return resolveUserProjectPath(workspaceRoot, relativePath)
}

export function relativePathFromAbs(
  workspaceRoot: string,
  absPath: string,
): string | null {
  const root = normalize(workspaceRoot)
  const abs = normalize(absPath)
  if (!abs.startsWith(root)) return null
  const rel = abs.slice(root.length).replace(/^[/\\]/, '')
  return rel || null
}

export function absPathFromDiagnosticUri(uri: string): string | null {
  try {
    if (uri.startsWith('file://')) return normalize(fileURLToPath(uri))
    return normalize(uri)
  } catch {
    return null
  }
}

export { SYNC_DEBOUNCE_MS }
