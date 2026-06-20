import { BrowserWindow } from 'electron'
import { accessSync, statSync } from 'fs'
import { X_OK } from 'constants'
import { homedir } from 'os'
import { resolvePathInsideWorkspace } from './git-service'
import { webContentSend } from '@main/services/web-content-send'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'

type TerminalSession = {
  pty: IPty
  conversationId: string
  cwd: string
  shell: string
}

const sessions = new Map<string, TerminalSession>()

function defaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL?.trim() || '/bin/zsh'
}

function canExecute(shellPath: string): boolean {
  if (!shellPath) return false
  if (!shellPath.includes('/')) return true
  try {
    accessSync(shellPath, X_OK)
    return true
  } catch {
    return false
  }
}

function resolveSpawnShell(preferred?: string | null): string {
  const candidate = preferred?.trim() || defaultShell()
  if (canExecute(candidate)) return candidate

  if (process.platform === 'win32') {
    for (const fallback of ['powershell.exe', 'cmd.exe']) {
      if (canExecute(fallback)) return fallback
    }
    return 'cmd.exe'
  }

  for (const fallback of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (canExecute(fallback)) return fallback
  }
  return '/bin/sh'
}

function isUsableDirectory(pathname: string): boolean {
  if (!pathname) return false
  try {
    return statSync(pathname).isDirectory()
  } catch {
    return false
  }
}

function resolveSpawnCwd(primary: string, fallbacks: string[]): string {
  if (isUsableDirectory(primary)) return primary
  for (const next of fallbacks) {
    if (isUsableDirectory(next)) return next
  }
  return process.cwd()
}

function shellArgs(shell: string): string[] {
  if (process.platform === 'win32') return []
  const lower = shell.toLowerCase()
  if (
    lower.endsWith('/bash') ||
    lower.endsWith('/zsh') ||
    lower.endsWith('/sh')
  ) {
    return ['-il']
  }
  return []
}

function broadcastStarted(conversationId: string, cwd: string, shell: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.WorkspaceTerminalStarted(window.webContents, {
      conversationId,
      cwd,
      shell,
    })
  }
}

function broadcastData(conversationId: string, data: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.WorkspaceTerminalData(window.webContents, {
      conversationId,
      data,
    })
  }
}

function broadcastExit(
  conversationId: string,
  exitCode: number,
  signal?: number,
) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.WorkspaceTerminalExit(window.webContents, {
      conversationId,
      exitCode,
      signal,
    })
  }
}

export function stopWorkspaceTerminalSession(conversationId: string): {
  ok: boolean
  error?: string
} {
  const id = conversationId.trim()
  if (!id) return { ok: false, error: 'conversationId is required.' }
  const session = sessions.get(id)
  if (!session) return { ok: true }
  try {
    session.pty.kill()
  } catch {
    // already dead
  } finally {
    sessions.delete(id)
  }
  return { ok: true }
}

export function startWorkspaceTerminalSession(options: {
  conversationId: string
  workspaceCwd: string
  relativeCwd?: string
  shell?: string | null
  cols?: number
  rows?: number
}): { ok: boolean; cwd?: string; shell?: string; error?: string } {
  const conversationId = options.conversationId.trim()
  if (!conversationId)
    return { ok: false, error: 'conversationId is required.' }

  const resolved = resolvePathInsideWorkspace(
    options.workspaceCwd,
    options.relativeCwd ?? '.',
  )
  if (!resolved.ok) return resolved

  const spawnCwd = resolveSpawnCwd(resolved.absolutePath, [
    options.workspaceCwd,
    process.cwd(),
    homedir(),
  ])
  const shell = resolveSpawnShell(options.shell)
  const cols = Math.max(20, Number(options.cols ?? 100))
  const rows = Math.max(8, Number(options.rows ?? 30))

  const existing = sessions.get(conversationId)
  if (existing && existing.cwd === spawnCwd && existing.shell === shell) {
    try {
      existing.pty.resize(cols, rows)
    } catch {
      // ignore resize failures on reused sessions
    }
    broadcastStarted(conversationId, existing.cwd, existing.shell)
    return { ok: true, cwd: existing.cwd, shell: existing.shell }
  }

  if (existing) {
    void stopWorkspaceTerminalSession(conversationId)
  }

  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      TERM: 'xterm-256color',
    }).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>

  const spawnPlans: Array<{ shell: string; args: string[]; cwd: string }> = [
    { shell, args: shellArgs(shell), cwd: spawnCwd },
    { shell, args: [], cwd: spawnCwd },
    { shell: resolveSpawnShell('/bin/sh'), args: ['-i'], cwd: spawnCwd },
    { shell: resolveSpawnShell('/bin/sh'), args: ['-i'], cwd: process.cwd() },
  ]

  let lastError = ''
  for (const plan of spawnPlans) {
    if (!canExecute(plan.shell)) continue
    try {
      const instance = pty.spawn(plan.shell, plan.args, {
        name: 'xterm-256color',
        cwd: plan.cwd,
        env,
        cols,
        rows,
      })

      const session: TerminalSession = {
        pty: instance,
        conversationId,
        cwd: plan.cwd,
        shell: plan.shell,
      }
      sessions.set(conversationId, session)

      instance.onData((data) => {
        broadcastData(conversationId, data)
      })

      instance.onExit(({ exitCode, signal }) => {
        sessions.delete(conversationId)
        broadcastExit(conversationId, exitCode, signal)
      })

      broadcastStarted(conversationId, plan.cwd, plan.shell)
      return { ok: true, cwd: plan.cwd, shell: plan.shell }
    } catch (err) {
      lastError = String(err)
    }
  }

  const requestedShell = options.shell?.trim() || defaultShell()
  return {
    ok: false,
    error:
      `Failed to spawn terminal (shell=${requestedShell}, resolvedShell=${shell}, cwd=${spawnCwd}): ${lastError || 'unknown spawn error'}. ` +
      `Tried plans: ${spawnPlans.map((p) => `${p.shell} ${p.args.join(' ')} @ ${p.cwd}`).join(' | ')}`,
  }
}

export function writeWorkspaceTerminalInput(options: {
  conversationId: string
  data: string
}): { ok: boolean; error?: string } {
  const id = options.conversationId.trim()
  if (!id) return { ok: false, error: 'conversationId is required.' }
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'No terminal session is running.' }
  try {
    session.pty.write(options.data)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export function resizeWorkspaceTerminalSession(options: {
  conversationId: string
  cols: number
  rows: number
}): { ok: boolean; error?: string } {
  const id = options.conversationId.trim()
  if (!id) return { ok: false, error: 'conversationId is required.' }
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'No terminal session is running.' }

  const cols = Math.max(20, Number(options.cols || 0))
  const rows = Math.max(8, Number(options.rows || 0))
  try {
    session.pty.resize(cols, rows)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
