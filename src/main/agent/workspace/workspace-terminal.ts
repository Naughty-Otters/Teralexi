import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { resolvePathInsideWorkspace } from './git-service'

export type WorkspaceTerminalRunResult = {
  ok: boolean
  cwd?: string
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: string
}

const OUTPUT_LIMIT = 10 * 1024 * 1024
const FORCE_KILL_TIMEOUT_MS = 1500

type ActiveTerminalProcess = {
  child: ChildProcessWithoutNullStreams
  forceKillTimer: ReturnType<typeof setTimeout> | null
}

const activeByConversationId = new Map<string, ActiveTerminalProcess>()

function appendWithLimit(base: string, chunk: string): string {
  const next = base + chunk
  if (next.length <= OUTPUT_LIMIT) return next
  return next.slice(next.length - OUTPUT_LIMIT)
}

function resolveWorkspaceShell(): string {
  if (process.platform === 'win32') {
    return process.env.ComSpec?.trim() || 'cmd.exe'
  }
  return process.env.SHELL?.trim() || '/bin/bash'
}

function interruptChildProcess(
  child: ChildProcessWithoutNullStreams,
  options?: { force?: boolean },
): boolean {
  if (process.platform === 'win32') {
    if (child.kill()) return true
    const pid = child.pid
    if (!pid) return false
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      })
      return true
    } catch {
      return child.kill()
    }
  }
  return child.kill(options?.force ? 'SIGKILL' : 'SIGINT')
}

export async function runWorkspaceTerminalCommandWithControl(options: {
  conversationId: string
  workspaceCwd: string
  command: string
  relativeCwd?: string
}): Promise<WorkspaceTerminalRunResult> {
  const conversationId = options.conversationId.trim()
  const command = options.command.trim()
  if (!conversationId) {
    return { ok: false, error: 'conversationId is required.' }
  }
  if (!command) {
    return { ok: false, error: 'Command must not be empty.' }
  }
  if (activeByConversationId.has(conversationId)) {
    return {
      ok: false,
      error: 'Another command is already running in this terminal session.',
    }
  }

  const resolved = resolvePathInsideWorkspace(
    options.workspaceCwd,
    options.relativeCwd ?? '.',
  )
  if (!resolved.ok) return resolved

  const shellPath = resolveWorkspaceShell()
  const shellArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', command]
      : ['-lc', command]

  return await new Promise<WorkspaceTerminalRunResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(shellPath, shellArgs, {
      cwd: resolved.absolutePath,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    activeByConversationId.set(conversationId, {
      child,
      forceKillTimer: null,
    })

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')

    child.stdout.on('data', (chunk: string) => {
      stdout = appendWithLimit(stdout, chunk)
    })

    child.stderr.on('data', (chunk: string) => {
      stderr = appendWithLimit(stderr, chunk)
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      activeByConversationId.delete(conversationId)
      resolve({
        ok: false,
        error: String(err),
        cwd: resolved.absolutePath,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: 1,
      })
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      const active = activeByConversationId.get(conversationId)
      if (active?.forceKillTimer) clearTimeout(active.forceKillTimer)
      activeByConversationId.delete(conversationId)

      const exitCode = typeof code === 'number' ? code : 1
      const out = stdout.trimEnd()
      const err = stderr.trimEnd()

      if (signal) {
        resolve({
          ok: false,
          error: `Command interrupted by ${signal}.`,
          cwd: resolved.absolutePath,
          stdout: out,
          stderr: err,
          exitCode,
        })
        return
      }

      if (exitCode === 0) {
        resolve({
          ok: true,
          cwd: resolved.absolutePath,
          stdout: out,
          stderr: err,
          exitCode,
        })
        return
      }

      resolve({
        ok: false,
        error: err || `Command exited with code ${exitCode}.`,
        cwd: resolved.absolutePath,
        stdout: out,
        stderr: err,
        exitCode,
      })
    })
  })
}

export function cancelWorkspaceTerminalCommand(conversationId: string): {
  ok: boolean
  error?: string
} {
  const id = conversationId.trim()
  if (!id) return { ok: false, error: 'conversationId is required.' }

  const active = activeByConversationId.get(id)
  if (!active) {
    return { ok: false, error: 'No running terminal command to cancel.' }
  }

  const interrupted = interruptChildProcess(active.child)
  if (!interrupted) {
    return { ok: false, error: 'Failed to send interrupt signal.' }
  }

  active.forceKillTimer = setTimeout(() => {
    const stillActive = activeByConversationId.get(id)
    if (!stillActive) return
    interruptChildProcess(stillActive.child, { force: true })
  }, FORCE_KILL_TIMEOUT_MS)

  return { ok: true }
}

/** Test helper: whether a conversation still has an active shell child. */
export function isWorkspaceTerminalCommandRunning(conversationId: string): boolean {
  return activeByConversationId.has(conversationId.trim())
}
