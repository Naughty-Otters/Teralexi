import { describe, expect, it, vi } from 'vitest'

const getDiagnosticReportMock = vi.hoisted(() => vi.fn())

vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@main/agent/sandbox', () => ({
  isPathInsideWorkspace: vi.fn(() => true),
  resolveUserProjectPath: vi.fn((workspaceRoot: string, rel: string) =>
    `${workspaceRoot}/${rel}`,
  ),
}))

vi.mock('./language-servers', () => ({
  isLspSupportedFile: vi.fn((p: string) => p.endsWith('.ts')),
}))

vi.mock('./lsp-manager', () => ({
  getLspManager: () => ({ getDiagnosticReport: getDiagnosticReportMock }),
}))

import { applyLspDiagnostics } from './apply-lsp-diagnostics'

describe('applyLspDiagnostics', () => {
  it('augments successful edit results with diagnostic summary', async () => {
    getDiagnosticReportMock.mockResolvedValue({
      block: '- src/a.ts:1:1 error TS1005',
      errorCount: 1,
    })

    const execute = vi.fn(async () => ({
      applied: true,
      workspacePath: '/ws',
      path: 'src/a.ts',
    }))
    const toolSet: Record<string, unknown> = {
      apply_patch: { execute },
    }

    applyLspDiagnostics(toolSet)
    const wrapped = toolSet.apply_patch as { execute: (input: unknown) => Promise<unknown> }
    const result = (await wrapped.execute({})) as Record<string, unknown>

    expect(getDiagnosticReportMock).toHaveBeenCalledWith('/ws/src/a.ts', '/ws')
    expect(result.lspErrorCount).toBe(1)
    expect(String(result.lspDiagnostics)).toContain('LSP errors detected')
  })

  it('does not augment results when tool output indicates failure', async () => {
    const execute = vi.fn(async () => ({
      error: 'failed',
      workspacePath: '/ws',
      path: 'src/a.ts',
    }))
    const toolSet: Record<string, unknown> = {
      write_file: { execute },
    }

    applyLspDiagnostics(toolSet)
    const wrapped = toolSet.write_file as { execute: (input: unknown) => Promise<unknown> }
    const result = await wrapped.execute({})

    expect(getDiagnosticReportMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ error: 'failed' })
  })

  it('ignores non-content tools and preserves original behavior', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const toolSet: Record<string, unknown> = {
      grep_files: { execute },
    }

    applyLspDiagnostics(toolSet)
    const wrapped = toolSet.grep_files as { execute: (input: unknown) => Promise<unknown> }
    const result = await wrapped.execute({ query: 'x' })

    expect(result).toMatchObject({ ok: true })
    expect(getDiagnosticReportMock).not.toHaveBeenCalled()
  })

  it('returns original result when diagnostics throw', async () => {
    getDiagnosticReportMock.mockRejectedValueOnce(new Error('lsp failure'))

    const execute = vi.fn(async () => ({
      promoted: true,
      workspacePath: '/ws',
      path: 'src/a.ts',
    }))
    const toolSet: Record<string, unknown> = {
      promote_artifact: { execute },
    }

    applyLspDiagnostics(toolSet)
    const wrapped = toolSet.promote_artifact as {
      execute: (input: unknown) => Promise<unknown>
    }
    const result = await wrapped.execute({})

    expect(result).toMatchObject({ promoted: true, path: 'src/a.ts' })
  })
})
