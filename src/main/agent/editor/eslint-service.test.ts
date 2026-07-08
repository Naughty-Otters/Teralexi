import { describe, expect, it, vi, beforeEach } from 'vitest'

const resolveFilesCwd = vi.hoisted(() => vi.fn())
const existsSync = vi.hoisted(() => vi.fn())
const lintFiles = vi.hoisted(() => vi.fn())
const ESLintCtor = vi.hoisted(() =>
  vi.fn(function ESLint() {
    return { lintFiles }
  }),
)

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/tmp/teralexi-eslint-abc'),
  }
})
vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@main/agent/workspace/workspace-ipc-helpers', () => ({
  resolveFilesCwd,
}))
vi.mock('@main/agent/sandbox', () => ({
  resolveUserProjectPath: (cwd: string, rel: string) => `${cwd}/${rel}`,
}))
vi.mock('node:module', () => ({
  createRequire: () => (id: string) => {
    if (id === 'eslint') return { ESLint: ESLintCtor }
    throw new Error(`Cannot find module '${id}'`)
  },
}))

import { lintWorkspaceFile } from './eslint-service'

describe('lintWorkspaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveFilesCwd.mockReturnValue({ ok: true, cwd: '/ws', source: 'workspace' })
    existsSync.mockReturnValue(false)
    lintFiles.mockResolvedValue([
      {
        messages: [
          {
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 5,
            message: 'Unexpected var',
            severity: 2,
            ruleId: 'no-var',
          },
          {
            line: 2,
            column: 3,
            message: 'Prefer const',
            severity: 1,
            ruleId: 'prefer-const',
          },
        ],
      },
    ])
  })

  it('returns error when workspace cwd cannot be resolved', async () => {
    resolveFilesCwd.mockReturnValue({ ok: false, error: 'No workspace.' })

    const result = await lintWorkspaceFile('conv-1', 'src/a.ts', 'var x = 1')

    expect(result).toEqual({ ok: false, error: 'No workspace.' })
  })

  it('requires relativePath', async () => {
    const result = await lintWorkspaceFile('conv-1', '', 'var x = 1')

    expect(result).toEqual({ ok: false, error: 'relativePath is required.' })
  })

  it('returns empty diagnostics when eslint config is missing', async () => {
    const result = await lintWorkspaceFile('conv-1', 'src/a.ts', 'var x = 1')

    expect(result).toEqual({ ok: true, diagnostics: [] })
    expect(ESLintCtor).not.toHaveBeenCalled()
  })

  it('maps eslint messages to editor diagnostics', async () => {
    existsSync.mockImplementation((path: string) =>
      String(path).endsWith('eslint.config.js'),
    )

    const result = await lintWorkspaceFile('conv-1', 'src/a.ts', 'var x = 1')

    expect(ESLintCtor).toHaveBeenCalledWith({ cwd: '/ws' })
    expect(lintFiles).toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([
      {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 5,
        message: 'Unexpected var',
        severity: 'error',
        ruleId: 'no-var',
      },
      {
        line: 2,
        column: 3,
        endLine: 2,
        endColumn: 4,
        message: 'Prefer const',
        severity: 'warning',
        ruleId: 'prefer-const',
      },
    ])
  })

  it('returns error when eslint throws', async () => {
    existsSync.mockImplementation((path: string) =>
      String(path).endsWith('eslint.config.js'),
    )
    lintFiles.mockRejectedValue(new Error('lint failed'))

    const result = await lintWorkspaceFile('conv-1', 'src/a.ts', 'var x = 1')

    expect(result).toEqual({ ok: false, error: 'Error: lint failed' })
  })
})
