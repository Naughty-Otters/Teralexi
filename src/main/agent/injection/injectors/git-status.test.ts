import { describe, expect, it, vi, beforeEach } from 'vitest'

const loadConversationWorkspace = vi.hoisted(() => vi.fn())
const execFileSync = vi.hoisted(() => vi.fn())
const existsSync = vi.hoisted(() => vi.fn())

vi.mock('../../workspace/conversation-workspace', () => ({
  loadConversationWorkspace,
}))

vi.mock('node:child_process', () => ({
  execFileSync,
}))

vi.mock('node:fs', () => ({
  existsSync,
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}))

import {
  buildGitStatusBlock,
  isGitRepository,
  gitStatusInjector,
  MAX_GIT_STATUS_LINES,
} from './git-status'

const WS = '/repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isGitRepository', () => {
  it('is true when a .git folder exists (no git spawn needed)', () => {
    existsSync.mockReturnValue(true)
    expect(isGitRepository(WS)).toBe(true)
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('falls back to rev-parse when .git is absent', () => {
    existsSync.mockReturnValue(false)
    execFileSync.mockReturnValue('true\n')
    expect(isGitRepository(WS)).toBe(true)
  })

  it('is false when not a work tree', () => {
    existsSync.mockReturnValue(false)
    execFileSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })
    expect(isGitRepository(WS)).toBe(false)
  })
})

describe('buildGitStatusBlock', () => {
  it('renders branch and changed paths', () => {
    execFileSync.mockReturnValue(
      '## main...origin/main [ahead 1]\n M src/a.ts\n?? b.ts\n',
    )
    const block = buildGitStatusBlock(WS)
    expect(block).toContain('=== GIT STATUS ===')
    expect(block).toContain('Branch: main...origin/main [ahead 1]')
    expect(block).toContain(' M src/a.ts')
    expect(block).toContain('?? b.ts')
  })

  it('reports a clean tree when there are no changes', () => {
    execFileSync.mockReturnValue('## main\n')
    expect(buildGitStatusBlock(WS)).toContain('Working tree clean.')
  })

  it('truncates long change lists', () => {
    const changes = Array.from(
      { length: MAX_GIT_STATUS_LINES + 5 },
      (_, i) => ` M file-${i}.ts`,
    ).join('\n')
    execFileSync.mockReturnValue(`## main\n${changes}\n`)
    expect(buildGitStatusBlock(WS)).toContain('and 5 more changed path(s)')
  })

  it('returns empty when git fails', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(buildGitStatusBlock(WS)).toBe('')
  })
})

describe('gitStatusInjector', () => {
  it('applies only for git-initialized workspaces', () => {
    loadConversationWorkspace.mockReturnValue(WS)
    existsSync.mockReturnValue(true)
    expect(
      gitStatusInjector.applies({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toBe(true)

    loadConversationWorkspace.mockReturnValue(null)
    expect(
      gitStatusInjector.applies({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toBe(false)
  })

  it('injects the git status block', () => {
    loadConversationWorkspace.mockReturnValue(WS)
    execFileSync.mockReturnValue('## main\n M src/a.ts\n')
    expect(
      gitStatusInjector.injectInstructions({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toContain('Branch: main')
  })
})
