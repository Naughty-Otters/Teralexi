import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isWin } from '@test-paths'
import { isRipgrepAvailable, runRipgrepFiles, runRipgrepJson } from './ripgrep'

describe('ripgrep helpers', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'teralexi-rg-'))
    await mkdir(path.join(root, 'nested'), { recursive: true })
    await writeFile(path.join(root, 'a.ts'), 'const needle = 1\n', 'utf-8')
    await writeFile(
      path.join(root, 'nested', 'b.ts'),
      'export const value = 2\n',
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reports ripgrep availability as boolean', async () => {
    const available = await isRipgrepAvailable()
    expect(typeof available).toBe('boolean')
  })

  it('returns matches when available, otherwise returns fallback shape', async () => {
    const result = await runRipgrepJson(['needle', '.'], root)

    expect(typeof result.available).toBe('boolean')
    expect(Array.isArray(result.matches)).toBe(true)

    if (result.available) {
      expect(result.matches.some((m) => m.path.endsWith('a.ts'))).toBe(true)
      const match = result.matches.find((m) => m.path.endsWith('a.ts'))
      expect(match?.line).toContain('needle')
    } else {
      expect(result.matches).toEqual([])
    }
  })

  it('returns file paths when available, otherwise returns fallback shape', async () => {
    const result = await runRipgrepFiles(['-g', '*.ts'], root)

    expect(typeof result.available).toBe('boolean')
    expect(Array.isArray(result.paths)).toBe(true)

    if (result.available) {
      expect(result.paths.some((p) => p === path.resolve(root, 'a.ts'))).toBe(true)
      expect(result.paths.some((p) => p === path.resolve(root, 'nested/b.ts'))).toBe(
        true,
      )
      expect(result.paths.every((p) => path.isAbsolute(p))).toBe(true)
    } else {
      expect(result.paths).toEqual([])
    }
  })

  it.skipIf(isWin)('falls back to unavailable=false on invalid command args', async () => {
    const result = await runRipgrepFiles(['--invalid-teralexi-flag'], root)
    expect(result.available).toBe(false)
    expect(result.paths).toEqual([])
    expect(result.error).toContain('invalid-teralexi-flag')
  })
})
