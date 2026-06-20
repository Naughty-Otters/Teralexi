import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { applyReadFileLedgerGate } from './read-file-ledger-gate'
import { applyPerStreamToolInputDedupe } from '../steps/step-helpers'
import { applyRunScopedReadCache, ToolReadCache } from './tool-read-cache'

describe('applyReadFileLedgerGate', () => {
  it('blocks repeat read without reason when cache has the window', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ledger-gate-'))
    const filePath = join(root, 'a.ts')
    writeFileSync(filePath, 'line\n')

    const execute = vi.fn(async () => ({
      content: 'line\n',
      path: filePath,
      modifiedAt: new Date().toISOString(),
    }))
    const cache = new ToolReadCache()
    const pathContext = { sandboxRoot: root, workspacePath: root }
    const toolSet = { read_file: { execute } }

    applyRunScopedReadCache(toolSet, { cache, getPathContext: () => pathContext })
    applyReadFileLedgerGate(toolSet, { cache, getPathContext: () => pathContext })

    const input = { path: 'a.ts' }
    await toolSet.read_file.execute(input)
    const blocked = await toolSet.read_file.execute(input)

    expect(blocked).toMatchObject({ requiresReason: true, error: expect.stringContaining('reason') })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('allows repeat read when reason is provided', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ledger-gate-reason-'))
    const filePath = join(root, 'b.ts')
    writeFileSync(filePath, 'v1\n')

    const execute = vi
      .fn()
      .mockResolvedValueOnce({ content: 'v1\n', path: filePath })
      .mockResolvedValueOnce({ content: 'v2\n', path: filePath })
    const cache = new ToolReadCache()
    const pathContext = { sandboxRoot: root, workspacePath: root }
    const toolSet = { read_file: { execute } }

    applyRunScopedReadCache(toolSet, { cache, getPathContext: () => pathContext })
    applyReadFileLedgerGate(toolSet, { cache, getPathContext: () => pathContext })
    applyPerStreamToolInputDedupe(toolSet as Record<string, any>, {
      pathContext,
    })

    await toolSet.read_file.execute({ path: 'b.ts' })
    const second = await toolSet.read_file.execute({
      path: 'b.ts',
      reason: 'verify after edit',
    })

    expect(second).toEqual({ content: 'v2\n', path: filePath })
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('allows reading next page with a new offset without reason', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ledger-gate-offset-'))
    const filePath = join(root, 'c.ts')
    writeFileSync(filePath, 'a\nb\nc\n')

    const execute = vi.fn(async (input: Record<string, unknown>) => ({
      content: `chunk@${input.offset}`,
      path: filePath,
      modifiedAt: new Date().toISOString(),
    }))
    const cache = new ToolReadCache()
    const pathContext = { sandboxRoot: root, workspacePath: root }
    const toolSet = { read_file: { execute } }

    applyRunScopedReadCache(toolSet, { cache, getPathContext: () => pathContext })
    applyReadFileLedgerGate(toolSet, { cache, getPathContext: () => pathContext })

    await toolSet.read_file.execute({ path: 'c.ts', offset: 1, limit: 1 })
    const page2 = await toolSet.read_file.execute({ path: 'c.ts', offset: 2, limit: 1 })

    expect(page2).toMatchObject({ content: 'chunk@2' })
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
