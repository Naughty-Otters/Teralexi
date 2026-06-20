import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildFileChangePreview,
  convertToLineEnding,
  createDiffMetadata,
  detectLineEnding,
  matchPathToDisplayPath,
  movePath,
  normalizeLineEndings,
  readTextFileIfExists,
  trimDiff,
  toToolAbsolutePath,
  toToolDisplayPath,
  withFileLock,
} from './file-io-utils'

describe('file-io-utils', () => {
  it('normalizes and converts line endings', () => {
    expect(normalizeLineEndings('a\r\nb\r\n')).toBe('a\nb\n')
    expect(detectLineEnding('a\r\n')).toBe('\r\n')
    expect(detectLineEnding('a\nb\n')).toBe('\n')
    expect(convertToLineEnding('a\nb\n', '\r\n')).toBe('a\r\nb\r\n')
    expect(convertToLineEnding('a\nb\n', '\n')).toBe('a\nb\n')
  })

  it('trims unified diff indentation and computes metadata', () => {
    const diff = trimDiff('@@\n-  old\n+  new\n  unchanged')
    expect(diff).toContain('- old')
    expect(diff).toContain('+ new')

    const meta = createDiffMetadata('f.txt', 'one\ntwo\n', 'one\nthree\n')
    expect(meta.diff).toContain('-two')
    expect(meta.diff).toContain('+three')
    expect(meta.additions).toBeGreaterThan(0)
    expect(meta.deletions).toBeGreaterThan(0)
  })

  it('builds file preview rows with moveFrom and relative path', () => {
    const sandboxRoot = '/tmp/sandbox-root'
    const preview = buildFileChangePreview(
      sandboxRoot,
      '/tmp/sandbox-root/dir/new.txt',
      'before',
      'after',
      {
        action: 'rename',
        moveFrom: '/tmp/sandbox-root/dir/old.txt',
      },
    )

    expect(preview.path).toBe(path.join('dir', 'new.txt'))
    expect(preview.action).toBe('rename')
    expect(preview.moveFrom).toBe(path.join('dir', 'old.txt'))
    expect(preview.diff).toContain('+after')
  })

  it('reads optional file content and handles missing files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openfde-file-io-'))
    try {
      const file = path.join(root, 'x.txt')
      await writeFile(file, 'hello', 'utf-8')

      await expect(readTextFileIfExists(file)).resolves.toBe('hello')
      await expect(
        readTextFileIfExists(path.join(root, 'missing.txt')),
      ).resolves.toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('moves files and honors overwrite behavior', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openfde-move-path-'))
    try {
      const src = path.join(root, 'src.txt')
      const dest = path.join(root, 'sub', 'dest.txt')
      await writeFile(src, 'payload', 'utf-8')
      await movePath(src, dest, false)

      await expect(readFile(dest, 'utf-8')).resolves.toBe('payload')

      const src2 = path.join(root, 'src2.txt')
      await writeFile(src2, 'new', 'utf-8')
      await expect(movePath(src2, dest, false)).rejects.toThrow(
        /Destination already exists/,
      )
      await movePath(src2, dest, true)
      await expect(readFile(dest, 'utf-8')).resolves.toBe('new')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('serializes concurrent access with withFileLock', async () => {
    const order: string[] = []
    const file = '/tmp/lock-target'

    const first = withFileLock(file, async () => {
      order.push('first:start')
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push('first:end')
      return 'first'
    })

    const second = withFileLock(file, async () => {
      order.push('second:start')
      order.push('second:end')
      return 'second'
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      'first',
      'second',
    ])
    expect(order).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  it('matchPathToDisplayPath returns absolute paths for grep/glob round-trip', async () => {
    const ws = await mkdtemp(path.join(tmpdir(), 'openfde-display-ws-'))
    const sb = await mkdtemp(path.join(tmpdir(), 'openfde-display-sb-'))
    const srcDir = path.join(ws, 'src')
    await mkdir(srcDir, { recursive: true })
    const absFile = path.join(srcDir, 'search.ts')
    await writeFile(absFile, 'x', 'utf-8')

    expect(toToolDisplayPath(absFile, sb, ws)).toBe('src/search.ts')
    expect(toToolAbsolutePath(absFile)).toBe(path.resolve(absFile))
    expect(matchPathToDisplayPath('search.ts', srcDir, sb, ws)).toBe(
      path.resolve(absFile),
    )
    expect(matchPathToDisplayPath('src/search.ts', ws, sb, ws)).toBe(
      path.resolve(absFile),
    )

    await rm(ws, { recursive: true, force: true })
    await rm(sb, { recursive: true, force: true })
  })
})
