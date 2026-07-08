import { describe, expect, it, vi, beforeEach } from 'vitest'

const resolveFilesCwd = vi.hoisted(() => vi.fn())
const existsSync = vi.hoisted(() => vi.fn())
const mockFormat = vi.hoisted(() => vi.fn())
const mockResolveConfig = vi.hoisted(() => vi.fn())
const mockGetFileInfo = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({ existsSync }))
vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@main/agent/workspace/workspace-ipc-helpers', () => ({
  resolveFilesCwd,
}))
vi.mock('@main/agent/sandbox', () => ({
  resolveUserProjectPath: (cwd: string, rel: string) => `${cwd}/${rel}`,
}))
vi.mock('@main/agent/lsp/language-servers', () => ({
  bundledBinDir: () => null,
}))
vi.mock('node:module', () => ({
  createRequire: () => (id: string) => {
    if (id === 'prettier') {
      return {
        format: mockFormat,
        resolveConfig: mockResolveConfig,
        getFileInfo: mockGetFileInfo,
      }
    }
    throw new Error(`Cannot find module '${id}'`)
  },
}))

import { formatWorkspaceFile } from './format-service'

describe('formatWorkspaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveFilesCwd.mockReturnValue({ ok: true, cwd: '/ws', source: 'workspace' })
    existsSync.mockReturnValue(false)
    mockGetFileInfo.mockResolvedValue({ ignored: false })
    mockResolveConfig.mockResolvedValue({ semi: true })
    mockFormat.mockResolvedValue('formatted content\n')
  })

  it('returns error when workspace cwd cannot be resolved', async () => {
    resolveFilesCwd.mockReturnValue({ ok: false, error: 'No workspace.' })

    const result = await formatWorkspaceFile('conv-1', 'src/a.ts', 'x')

    expect(result).toEqual({ ok: false, error: 'No workspace.' })
  })

  it('requires relativePath', async () => {
    const result = await formatWorkspaceFile('conv-1', '  ', 'x')

    expect(result).toEqual({ ok: false, error: 'relativePath is required.' })
  })

  it('returns error when prettier is not available and no config exists', async () => {
    const result = await formatWorkspaceFile('conv-1', 'src/a.ts', 'const x=1')

    expect(result).toEqual({
      ok: false,
      error: 'Prettier is not configured for this workspace.',
    })
  })

  it('formats file when prettier config exists', async () => {
    existsSync.mockImplementation((path: string) =>
      String(path).endsWith('.prettierrc'),
    )

    const result = await formatWorkspaceFile('conv-1', 'src/a.ts', 'const x=1')

    expect(mockGetFileInfo).toHaveBeenCalledWith('/ws/src/a.ts')
    expect(mockResolveConfig).toHaveBeenCalledWith('/ws/src/a.ts')
    expect(mockFormat).toHaveBeenCalledWith('const x=1', {
      semi: true,
      filepath: '/ws/src/a.ts',
    })
    expect(result).toEqual({ ok: true, content: 'formatted content\n' })
  })

  it('returns error when prettier ignores the file', async () => {
    existsSync.mockImplementation((path: string) =>
      String(path).endsWith('.prettierrc'),
    )
    mockGetFileInfo.mockResolvedValue({ ignored: true })

    const result = await formatWorkspaceFile('conv-1', 'src/a.ts', 'const x=1')

    expect(result).toEqual({ ok: false, error: 'File is ignored by Prettier.' })
  })

  it('returns error when prettier throws', async () => {
    existsSync.mockImplementation((path: string) =>
      String(path).endsWith('.prettierrc'),
    )
    mockFormat.mockRejectedValue(new Error('Syntax error'))

    const result = await formatWorkspaceFile('conv-1', 'src/a.ts', 'const x=1')

    expect(result).toEqual({ ok: false, error: 'Error: Syntax error' })
  })
})
