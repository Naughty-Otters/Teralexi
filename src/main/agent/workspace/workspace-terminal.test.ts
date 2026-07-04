import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  runWorkspaceTerminalCommandWithControl,
  cancelWorkspaceTerminalCommand,
  isWorkspaceTerminalCommandRunning,
} from './workspace-terminal'

let dir: string

function slowCommand(): string {
  if (process.platform === 'win32') {
    return 'ping -n 10 127.0.0.1'
  }
  return 'sleep 10'
}

async function waitUntilCommandRunning(
  conversationId: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isWorkspaceTerminalCommandRunning(conversationId)) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      continue
    }
    // Ensure the child stays alive briefly (avoids racing a fast-failing shell).
    await new Promise((resolve) => setTimeout(resolve, 150))
    if (isWorkspaceTerminalCommandRunning(conversationId)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for command ${conversationId} to start`)
}

async function waitForCommandCleanup(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, process.platform === 'win32' ? 300 : 100))
}

function cleanupDir(dirPath: string): void {
  try {
    rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    // Windows can briefly lock temp dirs while cmd/node exit.
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'moderatus-terminal-test-'))
})

afterEach(async () => {
  cancelWorkspaceTerminalCommand('cid-busy')
  cancelWorkspaceTerminalCommand('cid-cancel')
  await waitForCommandCleanup()
  if (dir) cleanupDir(dir)
})

// ─── runWorkspaceTerminalCommandWithControl ────────────────────────────────────

describe('runWorkspaceTerminalCommandWithControl', () => {
  it('returns error for empty conversationId', async () => {
    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: '  ',
      workspaceCwd: dir,
      command: 'echo hi',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/conversationId/)
  })

  it('returns error for empty command', async () => {
    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-1',
      workspaceCwd: dir,
      command: '   ',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/empty/)
  })

  it('rejects relative cwd that escapes workspace', async () => {
    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-esc',
      workspaceCwd: dir,
      command: 'echo hi',
      relativeCwd: '../outside',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/escape/)
  })

  it('executes simple command and returns stdout', async () => {
    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-echo',
      workspaceCwd: dir,
      command: 'echo hello-from-test',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stdout).toContain('hello-from-test')
    expect(result.exitCode).toBe(0)
    expect(result.cwd).toBe(dir)
  })

  it('reports non-zero exit code as failure', async () => {
    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-fail',
      workspaceCwd: dir,
      command: 'exit 42',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.exitCode === 'number').toBe(true)
      expect(result.exitCode).toBeGreaterThan(0)
    }
  })

  it('resolves relative cwd inside workspace', async () => {
    const subdir = join(dir, 'nested')
    mkdirSync(subdir)
    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-sub',
      workspaceCwd: dir,
      command: 'pwd',
      relativeCwd: 'nested',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stdout).toContain('nested')
  })

  it('returns error when same conversationId already has a running command', async () => {
    // Start a slow command but don't await it yet
    const slow = runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-busy',
      workspaceCwd: dir,
      command: slowCommand(),
    })

    await waitUntilCommandRunning('cid-busy', 20_000)

    // Try another command with the same id
    const conflict = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-busy',
      workspaceCwd: dir,
      command: 'echo conflict',
    })

    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.error).toMatch(/already running/)

    // Cancel the slow command to avoid test timeout
    cancelWorkspaceTerminalCommand('cid-busy')
    await slow
  }, 10_000)
})

// ─── cancelWorkspaceTerminalCommand ───────────────────────────────────────────

describe('cancelWorkspaceTerminalCommand', () => {
  it('returns error for empty conversationId', () => {
    const result = cancelWorkspaceTerminalCommand('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/conversationId/)
  })

  it('returns error when no command is running', () => {
    const result = cancelWorkspaceTerminalCommand('not-running-id')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/No running/)
  })

  it('successfully interrupts a running command', async () => {
    const runPromise = runWorkspaceTerminalCommandWithControl({
      conversationId: 'cid-cancel',
      workspaceCwd: dir,
      command: slowCommand(),
    })

    await waitUntilCommandRunning('cid-cancel')
    const cancel = cancelWorkspaceTerminalCommand('cid-cancel')
    expect(cancel.ok).toBe(true)

    const result = await runPromise
    expect(result.ok).toBe(false)
  }, 20_000)
})
