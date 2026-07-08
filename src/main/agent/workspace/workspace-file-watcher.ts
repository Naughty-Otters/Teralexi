import { watch, type FSWatcher } from 'node:fs'
import { BrowserWindow } from 'electron'
import { createLogger } from '@main/logger'
import { webContentSend } from '@main/services/web-content-send'
import { ensureFilesCwd } from './workspace-ipc-helpers'

const log = createLogger('agent.workspace.file-watcher')

// Coalesce rapid filesystem events (e.g. an agent writing many files) into a
// single push to the renderer.
const DEBOUNCE_MS = 500

type WatchEntry = {
  watcher: FSWatcher
  cwd: string
  debounce: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<string, WatchEntry>()

function notifyFilesChanged(conversationId: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.WorkspaceFilesChanged(window.webContents, { conversationId })
  }
}

function scheduleNotify(conversationId: string): void {
  const entry = watchers.get(conversationId)
  if (!entry) return
  if (entry.debounce) clearTimeout(entry.debounce)
  entry.debounce = setTimeout(() => {
    entry.debounce = null
    notifyFilesChanged(conversationId)
  }, DEBOUNCE_MS)
}

export async function watchWorkspaceFiles(
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = conversationId?.trim()
  if (!id) return { ok: false, error: 'conversationId is required.' }

  const resolved = await ensureFilesCwd(id)
  if (!resolved.ok) {
    unwatchWorkspaceFiles(id)
    return { ok: false, error: resolved.error }
  }

  const existing = watchers.get(id)
  if (existing?.cwd === resolved.cwd) return { ok: true }

  unwatchWorkspaceFiles(id)

  try {
    const watcher = watch(
      resolved.cwd,
      { recursive: true },
      () => scheduleNotify(id),
    )
    watcher.on('error', (err) => {
      log.warn('Workspace file watcher error', { conversationId: id, err })
    })
    watchers.set(id, { watcher, cwd: resolved.cwd, debounce: null })
    return { ok: true }
  } catch (err) {
    log.warn('Failed to start workspace file watcher', { conversationId: id, err })
    return { ok: false, error: String(err) }
  }
}

export function unwatchWorkspaceFiles(conversationId: string): void {
  const id = conversationId?.trim()
  if (!id) return
  const entry = watchers.get(id)
  if (!entry) return
  if (entry.debounce) clearTimeout(entry.debounce)
  try {
    entry.watcher.close()
  } catch {
    /* ignore */
  }
  watchers.delete(id)
}

export function unwatchAllWorkspaceFiles(): void {
  for (const id of [...watchers.keys()]) {
    unwatchWorkspaceFiles(id)
  }
}
