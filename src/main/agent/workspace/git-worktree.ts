/**
 * Git worktree helpers for parallel sub-agent isolation.
 */
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { getTeralexiHome } from '@config/teralexi-home'
import { runGit, type GitResult } from './git-service'
import { isGitRepository } from '../injection/injectors/git-status'

export type GitWorktreeAddResult =
  | { ok: true; path: string; branch: string }
  | { ok: false; error: string }

export type GitWorktreeRemoveResult = GitResult

/** Managed worktree root: ~/.teralexi/worktrees/<runId> */
export function resolveSubAgentWorktreePath(runId: string): string {
  const safe = runId.trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
  return join(getTeralexiHome(), 'worktrees', safe)
}

export function subAgentWorktreeBranch(runId: string): string {
  const safe = runId.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48)
  return `teralexi/sub-agent/${safe || 'run'}`
}

export async function gitWorktreeAdd(opts: {
  repoRoot: string
  worktreePath: string
  branch: string
  /** Start from this ref (default HEAD). */
  startPoint?: string
}): Promise<GitWorktreeAddResult> {
  const repoRoot = opts.repoRoot.trim()
  if (!repoRoot || !isGitRepository(repoRoot)) {
    return { ok: false, error: 'Workspace is not a git repository' }
  }

  const worktreePath = opts.worktreePath.trim()
  const branch = opts.branch.trim()
  if (!worktreePath || !branch) {
    return { ok: false, error: 'worktreePath and branch are required' }
  }

  await mkdir(join(getTeralexiHome(), 'worktrees'), { recursive: true })

  const startPoint = opts.startPoint?.trim() || 'HEAD'
  // Create a new branch at startPoint in a new worktree.
  const result = await runGit(repoRoot, [
    'worktree',
    'add',
    '-b',
    branch,
    worktreePath,
    startPoint,
  ])
  if (!result.ok) {
    return { ok: false, error: result.error }
  }
  return { ok: true, path: worktreePath, branch }
}

export async function gitWorktreeRemove(opts: {
  repoRoot: string
  worktreePath: string
  force?: boolean
}): Promise<GitWorktreeRemoveResult> {
  const args = ['worktree', 'remove']
  if (opts.force) args.push('--force')
  args.push(opts.worktreePath.trim())
  return runGit(opts.repoRoot.trim(), args)
}

export async function gitWorktreeList(repoRoot: string): Promise<GitResult> {
  return runGit(repoRoot.trim(), ['worktree', 'list', '--porcelain'])
}

/** Diffstat of branch vs HEAD in the main checkout (for UI preview). */
export async function gitWorktreeDiffStat(
  repoRoot: string,
  branch: string,
): Promise<string | undefined> {
  const result = await runGit(repoRoot.trim(), [
    'diff',
    '--stat',
    `HEAD...${branch.trim()}`,
  ])
  if (!result.ok) return undefined
  const text = result.stdout.trim()
  return text || undefined
}

/** Merge a sub-agent branch into the main checkout's current branch. */
export async function gitMergeBranch(
  repoRoot: string,
  branch: string,
): Promise<GitResult> {
  return runGit(repoRoot.trim(), ['merge', '--no-ff', branch.trim(), '-m', `Merge ${branch.trim()}`])
}

/** Delete a local branch after the worktree is removed. */
export async function gitDeleteBranch(
  repoRoot: string,
  branch: string,
  force = true,
): Promise<GitResult> {
  return runGit(repoRoot.trim(), [
    'branch',
    force ? '-D' : '-d',
    branch.trim(),
  ])
}

/**
 * Commit any unstaged/untracked work in a worktree so merge/PR/diffstat see it.
 * No-op when clean.
 */
export async function gitCommitAllIfDirty(
  cwd: string,
  message: string,
): Promise<GitResult & { committed: boolean }> {
  const status = await runGit(cwd.trim(), ['status', '--porcelain'])
  if (!status.ok) return { ...status, committed: false }
  if (!status.stdout.trim()) {
    return { ok: true, stdout: '', stderr: '', committed: false }
  }
  const add = await runGit(cwd.trim(), ['add', '-A'])
  if (!add.ok) return { ...add, committed: false }
  const commit = await runGit(cwd.trim(), [
    'commit',
    '-m',
    message.trim() || 'Sub-agent changes',
  ])
  return { ...commit, committed: commit.ok }
}
