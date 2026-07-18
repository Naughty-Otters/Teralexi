import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runGit } from './git-service'
import {
  gitWorktreeAdd,
  gitWorktreeRemove,
  resolveSubAgentWorktreePath,
  subAgentWorktreeBranch,
} from './git-worktree'

describe('git-worktree helpers', () => {
  let repoRoot = ''

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'openfde-wt-'))
    await runGit(repoRoot, ['init'])
    await runGit(repoRoot, ['config', 'user.email', 'test@example.com'])
    await runGit(repoRoot, ['config', 'user.name', 'Test'])
    await writeFile(join(repoRoot, 'README.md'), 'hello\n')
    await runGit(repoRoot, ['add', 'README.md'])
    await runGit(repoRoot, ['commit', '-m', 'init'])
  })

  afterEach(async () => {
    if (repoRoot) await rm(repoRoot, { recursive: true, force: true })
  })

  it('creates and removes an isolated worktree branch', async () => {
    const runId = 'sub-agent-coding-abc12345'
    const worktreePath = join(repoRoot, '.worktrees', runId)
    const branch = subAgentWorktreeBranch(runId)
    const added = await gitWorktreeAdd({
      repoRoot,
      worktreePath,
      branch,
    })
    expect(added).toEqual({ ok: true, path: worktreePath, branch })

    await writeFile(join(worktreePath, 'feature.txt'), 'from sub-agent\n')
    await runGit(worktreePath, ['add', 'feature.txt'])
    await runGit(worktreePath, ['commit', '-m', 'sub-agent change'])

    const removed = await gitWorktreeRemove({
      repoRoot,
      worktreePath,
      force: true,
    })
    expect(removed.ok).toBe(true)
  })

  it('resolveSubAgentWorktreePath is stable for a run id', () => {
    const a = resolveSubAgentWorktreePath('sub-agent-coding-abc')
    const b = resolveSubAgentWorktreePath('sub-agent-coding-abc')
    expect(a).toBe(b)
    expect(a).toContain('worktrees')
  })

  it('gitCommitAllIfDirty commits untracked files', async () => {
    const { gitCommitAllIfDirty } = await import('./git-worktree')
    await writeFile(join(repoRoot, 'dirty.txt'), 'x\n')
    const result = await gitCommitAllIfDirty(repoRoot, 'sub-agent dirty')
    expect(result.ok).toBe(true)
    expect(result.committed).toBe(true)
    const clean = await gitCommitAllIfDirty(repoRoot, 'noop')
    expect(clean.ok).toBe(true)
    expect(clean.committed).toBe(false)
  })
})
