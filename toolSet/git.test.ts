import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPENFDE_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from './sandbox-paths'

const execFileMock = vi.hoisted(() => vi.fn())
const ghCreatePrMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    execFile: execFileMock,
  }
})

vi.mock('@main/agent/workspace/git-service', () => ({
  ghCreatePr: ghCreatePrMock,
}))

import {
  gitAdd,
  gitBranch,
  gitCheckout,
  gitCherryPick,
  gitClean,
  gitClone,
  gitCommit,
  gitConfig,
  gitCreatePr,
  gitDiff,
  gitFetch,
  gitInit,
  gitLog,
  gitMerge,
  gitPull,
  gitPush,
  gitRebase,
  gitRemote,
  gitReset,
  gitRevert,
  gitShow,
  gitStash,
  gitStatus,
  gitTag,
  gitTools,
  runGitCommand,
} from './git'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV]
  }
}

function mockExecSuccess(stdout = 'ok\n', stderr = '') {
  execFileMock.mockImplementation(
    (
      _file: string,
      _args: string[],
      _opts: unknown,
      maybeCb?: unknown,
    ) => {
      const cb =
        typeof _opts === 'function'
          ? (_opts as (err: Error | null, stdout: string, stderr: string) => void)
          : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
      cb(null, stdout, stderr)
    },
  )
}

function mockExecFailure(code = 1, stderr = 'error\n') {
  execFileMock.mockImplementation(
    (
      _file: string,
      _args: string[],
      _opts: unknown,
      maybeCb?: unknown,
    ) => {
      const cb =
        typeof _opts === 'function'
          ? (_opts as (err: Error & { code?: number; stdout?: string; stderr?: string }, o: string, s: string) => void)
          : (maybeCb as (err: Error & { code?: number; stdout?: string; stderr?: string }, o: string, s: string) => void)
      const err = new Error('failed') as Error & {
        code?: number
        stdout?: string
        stderr?: string
      }
      err.code = code
      err.stdout = ''
      err.stderr = stderr
      cb(err, '', stderr)
    },
  )
}

describe('runGitCommand', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-git-test-'))
    setSandboxRoot(sandboxRoot)
    execFileMock.mockReset()
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('runs git with parsed args and cwd', async () => {
    mockExecSuccess(' M file.txt\n')
    const result = await runGitCommand({
      args: ['status', '--porcelain=v2', '-b'],
      workingDirectory: '.',
    })
    expect(result.success).toBe(true)
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain=v2', '-b'],
      expect.objectContaining({ cwd: sandboxRoot }),
      expect.any(Function),
    )
  })

  it('returns ENOENT message when git is missing', async () => {
    const err = new Error('spawn git ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    execFileMock.mockImplementation(
      (
        _f: string,
        _a: string[],
        _o: unknown,
        cb: (e: NodeJS.ErrnoException | null, o: string, s: string) => void,
      ) => {
        cb(err, '', '')
      },
    )
    const result = await runGitCommand({ args: ['status'] })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/git executable not found/i)
  })

  it('returns cwd resolution error without invoking git', async () => {
    const result = await runGitCommand({
      args: ['status'],
      workingDirectory: '../../outside',
    })
    expect(result.success).toBe(false)
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('surfaces timeout when command is killed', async () => {
    execFileMock.mockImplementation(
      (
        _f: string,
        _a: string[],
        _o: unknown,
        cb: (e: Error & { killed?: boolean; code?: number }, o: string, s: string) => void,
      ) => {
        const err = new Error('killed') as Error & { killed?: boolean; code?: number }
        err.killed = true
        err.code = null as unknown as number
        cb(err, '', '')
      },
    )
    const result = await runGitCommand({ args: ['status'] })
    expect(result.success).toBe(false)
    expect(result.error).toBe('git command timed out')
  })
})

describe('git tools', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-git-tools-'))
    setSandboxRoot(sandboxRoot)
    execFileMock.mockReset()
    mockExecSuccess()
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('git_status requires sandbox or workspace', async () => {
    setSandboxRoot(undefined)
    const result = await gitStatus.execute({})
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('git_status invokes porcelain status', async () => {
    await gitStatus.execute({})
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain=v2', '-b'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_diff supports staged stat diff', async () => {
    await gitDiff.execute({ staged: true, stat: true, paths: ['src/a.ts'] })
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['diff', '--cached', '--stat', '--', 'src/a.ts'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_add stages with -A', async () => {
    await gitAdd.execute({ all: true })
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['add', '-A'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_commit builds -m message', async () => {
    await gitCommit.execute({ message: 'feat: test' })
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'feat: test'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_reset hard sets needsApproval', async () => {
    const fn = gitReset.needsApproval as (input: { mode?: string }) => boolean
    expect(fn({ mode: 'hard' })).toBe(true)
    expect(fn({ mode: 'soft' })).toBe(false)
  })

  it('surfaces non-zero exit codes', async () => {
    mockExecFailure(1, 'fatal: not a git repository\n')
    const result = await gitStatus.execute({})
    expect(result).toMatchObject({
      success: false,
      exitCode: 1,
      stderr: expect.stringContaining('not a git repository'),
    })
  })
})

const gitToolInputs: Record<string, Record<string, unknown>> = {
  git_status: { includeUntracked: false },
  git_diff: { paths: ['a.ts'] },
  git_log: { ref: 'HEAD~1', paths: ['src'] },
  git_show: { ref: 'HEAD~2', stat: true },
  git_add: { paths: ['.'] },
  git_reset: { mode: 'mixed', paths: ['file.ts'] },
  git_commit: { message: 'msg', amend: true },
  git_branch: { action: 'create', name: 'feature' },
  git_checkout: { branch: 'main', create: true },
  git_merge: { branch: 'dev', noFf: true, message: 'merge' },
  git_rebase: { onto: 'main' },
  git_cherry_pick: { commit: 'abc', noCommit: true },
  git_revert: { commit: 'def' },
  git_stash: { action: 'push', message: 'wip' },
  git_pull: { branch: 'main', rebase: true },
  git_push: { branch: 'main', setUpstream: true },
  git_fetch: { remote: 'origin', prune: true, all: true },
  git_clone: {
    url: 'https://github.com/acme/repo.git',
    directory: 'repo',
    branch: 'main',
    depth: 1,
  },
  git_remote: { action: 'add', name: 'upstream', url: 'https://example.com/r.git' },
  git_tag: { action: 'create', name: 'v1', message: 'release' },
  git_clean: { dryRun: false, force: true, directories: true },
  git_init: { bare: true },
  git_config: { action: 'set', key: 'user.email', value: 'a@b.com' },
}

describe('gitTools catalog', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-git-catalog-'))
    setSandboxRoot(sandboxRoot)
    execFileMock.mockReset()
    mockExecSuccess()
    ghCreatePrMock.mockReset()
    ghCreatePrMock.mockResolvedValue({ ok: true, url: 'https://github.com/acme/repo/pull/1' })
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('exports every git tool', () => {
    expect(gitTools).toHaveLength(24)
  })

  for (const tool of gitTools) {
    if (tool.name === 'git_create_pr') continue

    it(`${tool.name} executes with mocked git`, async () => {
      execFileMock.mockClear()
      await tool.execute(gitToolInputs[tool.name] ?? {})
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        expect.any(Array),
        expect.any(Object),
        expect.any(Function),
      )
    })
  }

  it('git_create_pr delegates to gh service', async () => {
    const result = await gitCreatePr.execute({
      title: 'Add tests',
      body: 'Summary\n\nTest plan',
    })
    expect(ghCreatePrMock).toHaveBeenCalledWith(
      sandboxRoot,
      expect.objectContaining({ title: 'Add tests' }),
    )
    expect(result).toMatchObject({
      ok: true,
      url: 'https://github.com/acme/repo/pull/1',
    })
  })

  it('git_add rejects missing paths when not using all/update', async () => {
    const result = await gitAdd.execute({})
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('git_branch delete and git_tag delete require approval', () => {
    const branchFn = gitBranch.needsApproval as (input: { action: string }) => boolean
    const tagFn = gitTag.needsApproval as (input: { action: string }) => boolean
    expect(branchFn({ action: 'delete' })).toBe(true)
    expect(tagFn({ action: 'delete' })).toBe(true)
  })

  it('git_clean requires approval when force without dry run', () => {
    const fn = gitClean.needsApproval as (input: { force?: boolean; dryRun?: boolean }) => boolean
    expect(fn({ force: true, dryRun: false })).toBe(true)
    expect(fn({ force: true, dryRun: true })).toBe(false)
  })

  it('git_rebase abort and continue', async () => {
    await gitRebase.execute({ abort: true, onto: 'main' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['rebase', '--abort'],
      expect.any(Object),
      expect.any(Function),
    )
    await gitRebase.execute({ continue: true, onto: 'main' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['rebase', '--continue'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_stash pop with index', async () => {
    await gitStash.execute({ action: 'pop', index: 2 })
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['stash', 'pop', 'stash@{2}'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_remote rename', async () => {
    await gitRemote.execute({
      action: 'rename',
      name: 'origin',
      newName: 'upstream',
    })
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['remote', 'rename', 'origin', 'upstream'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_remote get-url and set-url', async () => {
    await gitRemote.execute({ action: 'get-url', name: 'origin' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['remote', 'get-url', 'origin'],
      expect.any(Object),
      expect.any(Function),
    )

    await gitRemote.execute({
      action: 'set-url',
      name: 'origin',
      url: 'https://example.com/repo.git',
    })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['remote', 'set-url', 'origin', 'https://example.com/repo.git'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_tag list and delete', async () => {
    await gitTag.execute({ action: 'list' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['tag', '-l'],
      expect.any(Object),
      expect.any(Function),
    )

    await gitTag.execute({ action: 'delete', name: 'v1.0.0' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['tag', '-d', 'v1.0.0'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_config get, set, and unset', async () => {
    await gitConfig.execute({ action: 'get', key: 'user.email' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['--local', 'config', 'user.email'],
      expect.any(Object),
      expect.any(Function),
    )

    await gitConfig.execute({ action: 'set', key: 'user.name', value: 'Tester' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['--local', 'config', 'user.name', 'Tester'],
      expect.any(Object),
      expect.any(Function),
    )

    await gitConfig.execute({ action: 'unset', key: 'user.name' })
    expect(execFileMock).toHaveBeenLastCalledWith(
      'git',
      ['--local', 'config', '--unset', 'user.name'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('git_config rejects missing set value', async () => {
    const result = await gitConfig.execute({ action: 'set', key: 'user.name' })
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('returns validation error for invalid input', async () => {
    const result = await gitCommit.execute({ message: '' })
    expect(result).toMatchObject({ success: false, error: expect.any(Object) })
  })
})
