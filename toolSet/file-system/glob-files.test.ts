import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../sandbox-paths'

const { runRipgrepFilesMock } = vi.hoisted(() => ({
  runRipgrepFilesMock: vi.fn(),
}))

vi.mock('./ripgrep', () => ({
  runRipgrepFiles: runRipgrepFilesMock,
}))

import { globFiles } from './glob-files'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]
  }
}

describe('glob-files tool', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    runRipgrepFilesMock.mockReset()
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-glob-'))
    await mkdir(path.join(sandboxRoot, 'sub'), { recursive: true })
    await writeFile(path.join(sandboxRoot, 'a.ts'), 'a', 'utf-8')
    await writeFile(path.join(sandboxRoot, 'sub', 'b.ts'), 'b', 'utf-8')
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('validates sandbox/path/pattern errors', async () => {
    setSandboxRoot(undefined)
    await expect(globFiles.execute({ pattern: '*.ts' })).resolves.toMatchObject(
      {
        error: expect.stringContaining('sandbox'),
      },
    )

    setSandboxRoot(sandboxRoot)
    await expect(globFiles.execute({ pattern: '' })).resolves.toMatchObject({
      error: expect.stringContaining('Invalid pattern'),
    })
    await expect(
      globFiles.execute({ pattern: '*.ts', path: '../escape' }),
    ).resolves.toMatchObject({
      error: expect.stringMatching(/escapes root|sandbox/),
    })
  })

  it('uses ripgrep paths and sorts by mtime when available', async () => {
    runRipgrepFilesMock.mockResolvedValue({
      available: true,
      paths: [
        path.join(sandboxRoot, 'sub', 'b.ts'),
        path.join(sandboxRoot, 'a.ts'),
        path.join(sandboxRoot, 'missing.ts'),
      ],
    })

    const result = (await globFiles.execute({
      pattern: '*.ts',
      path: '.',
    })) as {
      count: number
      paths: string[]
      note?: string
    }

    expect(result.count).toBe(3)
    expect(result.paths[0]).toBe(path.join(sandboxRoot, 'sub', 'b.ts'))
    expect(result.paths).toContain(path.join(sandboxRoot, 'missing.ts'))
    expect(result.note).toBeUndefined()
  })

  it('falls back to node glob when ripgrep unavailable', async () => {
    runRipgrepFilesMock.mockResolvedValue({ available: false, paths: [] })

    const result = (await globFiles.execute({
      pattern: '**/*.ts',
      path: '.',
    })) as {
      count: number
      paths: string[]
      note?: string
    }

    expect(result.count).toBeGreaterThan(0)
    expect(result.paths.some((p) => p.endsWith('a.ts'))).toBe(true)
    expect(result.note).toContain('Node fallback')
  })

  it('truncates large result sets and reports errors from ripgrep runner', async () => {
    runRipgrepFilesMock.mockResolvedValue({
      available: true,
      paths: Array.from({ length: 120 }, (_, i) => `f-${i}.ts`),
    })

    const truncated = (await globFiles.execute({
      pattern: '*.ts',
      path: '.',
    })) as {
      count: number
      note?: string
    }

    expect(truncated.count).toBe(100)
    expect(truncated.note).toContain('truncated')

    runRipgrepFilesMock.mockRejectedValue(new Error('boom'))
    await expect(
      globFiles.execute({ pattern: '*.ts', path: '.' }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('boom'),
    })
  })
})
