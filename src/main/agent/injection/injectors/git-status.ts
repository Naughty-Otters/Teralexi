import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '@main/logger'
import { resolveGitBinary } from '../../workspace/git-binary'
import { loadConversationWorkspace } from '../../workspace/conversation-workspace'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'
import { createMtimeKeyedCache, pathMtimeKey } from '../injector-cache'

const log = createLogger('agent.injection.git-status')
const gitStatusCache = createMtimeKeyedCache<string>()

/** Cap changed-path lines so a large dirty tree doesn't flood the prompt. */
export const MAX_GIT_STATUS_LINES = 40

/** @internal Test helper — injector cache is process-local. */
export function clearGitStatusCacheForTests(): void {
  gitStatusCache.clear()
}

const GIT_TIMEOUT_MS = 4000

function runGit(workspacePath: string, args: string[]): string | null {
  try {
    return execFileSync(resolveGitBinary(), args, {
      cwd: workspacePath,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/** True when the workspace folder is inside a git working tree. */
export function isGitRepository(workspacePath: string): boolean {
  if (existsSync(join(workspacePath, '.git'))) return true
  return runGit(workspacePath, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true'
}

export function buildGitStatusBlock(workspacePath: string): string {
  const gitDir = join(workspacePath, '.git')
  return gitStatusCache.getOrCompute(
    [
      workspacePath,
      pathMtimeKey(join(gitDir, 'HEAD')),
      pathMtimeKey(join(gitDir, 'index')),
    ],
    () => buildGitStatusBlockUncached(workspacePath),
  )
}

function buildGitStatusBlockUncached(workspacePath: string): string {
  const raw = runGit(workspacePath, ['status', '--short', '--branch'])
  if (raw == null) {
    log.warn('git status injector could not read status', { workspacePath })
    return ''
  }

  const lines = raw.split('\n').map((line) => line.replace(/\s+$/, '')).filter(Boolean)
  if (lines.length === 0) return ''

  const [branchLine, ...changeLines] = lines
  const branch = branchLine.replace(/^##\s*/, '').trim() || '(unknown)'
  const shown = changeLines.slice(0, MAX_GIT_STATUS_LINES)
  const overflow =
    changeLines.length > shown.length
      ? [`… and ${changeLines.length - shown.length} more changed path(s)`]
      : []
  const body = changeLines.length === 0 ? ['Working tree clean.'] : shown

  return [
    '=== GIT STATUS ===',
    `Branch: ${branch}`,
    ...body,
    ...overflow,
    'Use git_status / git_diff for full detail before committing.',
    '=== END GIT STATUS ===',
  ].join('\n')
}

/**
 * Injects a compact `git status` snapshot whenever the conversation's workspace
 * folder is an initialized git repository, so the agent knows the branch and
 * pending changes without spending a tool call.
 */
export const gitStatusInjector: AgentInjector = {
  id: 'git-status',
  order: INJECTOR_ORDER.GIT_STATUS,
  applies({ ctx }) {
    const conversationId = ctx.opts.conversationId?.trim()
    if (!conversationId) return false
    const workspacePath = loadConversationWorkspace(conversationId)?.trim()
    if (!workspacePath) return false
    return isGitRepository(workspacePath)
  },
  injectInstructions({ ctx }) {
    const conversationId = ctx.opts.conversationId?.trim()
    if (!conversationId) return null
    const workspacePath = loadConversationWorkspace(conversationId)?.trim()
    if (!workspacePath) return null
    return buildGitStatusBlock(workspacePath) || null
  },
}
