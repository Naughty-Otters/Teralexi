import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OPENFDE_AGENT_WORKSPACE_PATH_ENV,
  WORKSPACE_PATH_GLOBAL_KEY,
} from '../sandbox-paths'
import { parseCommandArgv, runWorkspaceCommand } from './run-workspace-command'

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[OPENFDE_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[OPENFDE_AGENT_WORKSPACE_PATH_ENV]
  }
}

describe('parseCommandArgv', () => {
  it('splits quoted tokens', () => {
    expect(parseCommandArgv('npm run "my script"')).toEqual([
      'npm',
      'run',
      'my script',
    ])
  })
})

describe('run_workspace_command tool', () => {
  let workspaceRoot: string

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'openfde-ws-cmd-'))
    await writeFile(path.join(workspaceRoot, 'marker.txt'), 'ok', 'utf-8')
    setWorkspaceRoot(workspaceRoot)
  })

  afterEach(async () => {
    setWorkspaceRoot(undefined)
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('requires a workspace folder', async () => {
    setWorkspaceRoot(undefined)
    await expect(
      runWorkspaceCommand.execute({ command: ['node', '-e', 'process.exit(0)'] }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('workspace'),
    })
  })

  it('runs argv in workspace cwd', async () => {
    const isWin = process.platform === 'win32'
    const result = await runWorkspaceCommand.execute({
      command: isWin
        ? ['cmd', '/c', 'type', 'marker.txt']
        : ['cat', 'marker.txt'],
      timeoutMs: 10_000,
    })
    expect(result).toMatchObject({
      workspacePath: workspaceRoot,
      exitCode: 0,
    })
    expect(String(result.output ?? result.stdout)).toContain('ok')
  })

  it('rejects cwd outside workspace', async () => {
    const result = await runWorkspaceCommand.execute({
      command: ['node', '-e', 'process.exit(0)'],
      cwd: '../outside',
    })
    expect(result).toMatchObject({
      error: expect.stringContaining('inside the workspace'),
    })
  })

  it('runs shell features (pipes / &&) in shell mode', async () => {
    if (process.platform === 'win32') return // posix shell assertions
    const result = await runWorkspaceCommand.execute({
      command: 'echo hello && cat marker.txt | tr a-z A-Z',
      shell: true,
      timeoutMs: 10_000,
    })
    expect(result).toMatchObject({ exitCode: 0, shell: true })
    const out = String(result.output ?? result.stdout)
    expect(out).toContain('hello')
    expect(out).toContain('OK')
  })

  it('shell mode still confines cwd to the workspace', async () => {
    const result = await runWorkspaceCommand.execute({
      command: 'pwd',
      shell: true,
      cwd: '../outside',
    })
    expect(result).toMatchObject({
      error: expect.stringContaining('inside the workspace'),
    })
  })

  it('argv mode (default) does NOT interpret shell metacharacters', async () => {
    if (process.platform === 'win32') return
    // Without shell, "&&" is just an argument to echo, not a command separator.
    const result = await runWorkspaceCommand.execute({
      command: ['echo', 'a', '&&', 'b'],
      timeoutMs: 10_000,
    })
    expect(result).toMatchObject({ exitCode: 0, shell: false })
    expect(String(result.output ?? result.stdout)).toContain('a && b')
  })

  it('background mode returns taskId without blocking', async () => {
    if (process.platform === 'win32') return
    const result = await runWorkspaceCommand.execute({
      command: ['sleep', '0.2'],
      background: true,
    })
    expect(result).toMatchObject({
      background: true,
      taskId: expect.any(String),
      workspacePath: workspaceRoot,
    })
    expect(result.exitCode).toBeUndefined()
  })
})
