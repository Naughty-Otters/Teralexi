import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { applyRunScopedReadCache, ToolReadCache } from './tool-read-cache'

describe('ToolReadCache', () => {
  it('caches successful read_file results for the same normalized path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-read-cache-'))
    const filePath = join(root, 'a.ts')
    writeFileSync(filePath, 'export const x = 1\n')

    const execute = vi.fn(async () => ({
      path: filePath,
      content: 'export const x = 1\n',
      modifiedAt: new Date().toISOString(),
    }))
    const toolSet = { read_file: { execute } }
    const cache = new ToolReadCache()
    const pathContext = { sandboxRoot: root, workspacePath: root }

    applyRunScopedReadCache(toolSet, {
      cache,
      getPathContext: () => pathContext,
    })

    const inputA = { path: './a.ts' }
    const inputB = { path: 'a.ts' }
    const r1 = await toolSet.read_file.execute(inputA)
    const r2 = await toolSet.read_file.execute(inputB)

    expect(r1).toEqual(r2)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(cache.listReadPaths()).toContain(filePath)
  })

  it('invalidates cache when file mtime changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-read-cache-mtime-'))
    const filePath = join(root, 'b.ts')
    writeFileSync(filePath, 'v1\n')

    let content = 'v1\n'
    const execute = vi.fn(async () => ({
      path: filePath,
      content,
      modifiedAt: new Date().toISOString(),
    }))
    const toolSet = { read_file: { execute } }
    const cache = new ToolReadCache()
    const pathContext = { sandboxRoot: root, workspacePath: root }

    applyRunScopedReadCache(toolSet, {
      cache,
      getPathContext: () => pathContext,
    })

    await toolSet.read_file.execute({ path: 'b.ts' })
    content = 'v2\n'
    writeFileSync(filePath, content)
    const past = new Date(Date.now() - 60_000)
    utimesSync(filePath, past, past)

    await toolSet.read_file.execute({ path: 'b.ts' })
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('does not cache error results', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ error: 'Binary file cannot be read as text' })
      .mockResolvedValueOnce({ content: 'ok' })
    const toolSet = { read_file: { execute } }
    const cache = new ToolReadCache()

    applyRunScopedReadCache(toolSet, {
      cache,
      getPathContext: () => ({}),
    })

    const input = { path: 'bin.dat' }
    await toolSet.read_file.execute(input)
    await toolSet.read_file.execute(input)
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
