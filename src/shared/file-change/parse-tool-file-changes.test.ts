import { describe, expect, it } from 'vitest'
import {
  ensureFileChangeFilesInOutput,
  extractPathsFromPatchText,
  parseToolFileChanges,
  splitUnifiedDiff,
} from './parse-tool-file-changes'

describe('ensureFileChangeFilesInOutput', () => {
  it('keeps existing renderable files[] unchanged', () => {
    const input = {
      files: [
        {
          path: 'a.ts',
          diff: '--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-x\n+y',
        },
      ],
    }
    expect(ensureFileChangeFilesInOutput(input)).toBe(input)
  })

  it('rebuilds files[] when entries lack diffs', () => {
    const out = ensureFileChangeFilesInOutput({
      files: [{ path: 'ignored.ts', diff: '   ' }],
      path: 'hello.txt',
      diff: 'Index: hello.txt\n--- hello.txt\n+++ hello.txt\n@@ -1 +1 @@\n-a\n+b',
    })
    expect((out.files as unknown[]).length).toBe(1)
  })

  it('adds files[] from legacy diff + path fields', () => {
    const out = ensureFileChangeFilesInOutput({
      path: '/sandbox/hello.txt',
      sandboxRoot: '/sandbox',
      diff: 'Index: hello.txt\n--- hello.txt\n+++ hello.txt\n@@ -1 +1 @@\n-hello\n+hi',
      additions: 1,
      deletions: 1,
      written: true,
    })
    expect(Array.isArray(out.files)).toBe(true)
    expect((out.files as unknown[]).length).toBe(1)
    expect(parseToolFileChanges(out)).toHaveLength(1)
  })
})

describe('parseToolFileChanges', () => {
  it('reads structured files array from tool output', () => {
    const files = parseToolFileChanges({
      sandboxRoot: '/sandbox',
      files: [
        {
          path: 'src/a.ts',
          diff: 'Index: src/a.ts\n--- src/a.ts\n+++ src/a.ts\n@@ -1 +1 @@\n-old\n+new',
          additions: 1,
          deletions: 1,
          action: 'modify',
        },
      ],
    })
    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe('src/a.ts')
    expect(files[0]?.additions).toBe(1)
  })

  it('strips workspace-relative paths when workspacePath is set', () => {
    const files = parseToolFileChanges({
      sandboxRoot: '/sandbox',
      workspacePath: '/home/user/project',
      files: [
        {
          path: '/home/user/project/src/app.ts',
          diff: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y',
          additions: 1,
          deletions: 1,
          action: 'modify',
          workspacePath: '/home/user/project',
        },
      ],
    })
    expect(files[0]?.path).toBe('src/app.ts')
    expect(files[0]?.workspacePath).toBe('/home/user/project')
  })

  it('falls back to single diff + path fields', () => {
    const files = parseToolFileChanges({
      sandboxRoot: '/sandbox',
      path: '/sandbox/hello.txt',
      diff: 'Index: hello.txt\n--- hello.txt\n+++ hello.txt\n@@ -1 +1 @@\n-hello\n+hi',
      additions: 1,
      deletions: 1,
    })
    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe('hello.txt')
  })

  it('splits concatenated unified diffs', () => {
    const combined = [
      'Index: a.txt',
      '--- a.txt',
      '+++ a.txt',
      '@@ -1 +1 @@',
      '-a',
      '+A',
      'Index: b.txt',
      '--- b.txt',
      '+++ b.txt',
      '@@ -1 +1 @@',
      '-b',
      '+B',
    ].join('\n')

    expect(splitUnifiedDiff(combined)).toHaveLength(2)
    const files = parseToolFileChanges({
      diff: combined,
      additions: 2,
      deletions: 2,
    })
    expect(files).toHaveLength(2)
  })

  it('returns empty for invalid roots and blank diffs', () => {
    expect(parseToolFileChanges(null)).toEqual([])
    expect(parseToolFileChanges('not-an-object')).toEqual([])
    expect(parseToolFileChanges({ diff: '   ' })).toEqual([])
  })

  it('normalizes structured file entries and filters invalid rows', () => {
    const files = parseToolFileChanges({
      sandboxRoot: 'C:\\sandbox',
      files: [
        {
          path: 'C:\\sandbox\\src\\a.ts',
          moveFrom: 'C:\\sandbox\\src\\old-a.ts',
          diff: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts',
          additions: 2,
          deletions: 1,
          action: 'A',
        },
        {
          path: '/abs/outside/file.ts',
          diff: 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts',
          action: 'rename',
        },
        {
          path: 'ignored.ts',
          diff: '   ',
        },
      ],
    })

    expect(files).toHaveLength(2)
    expect(files[0]).toMatchObject({
      path: 'src/a.ts',
      moveFrom: 'src/old-a.ts',
      action: 'create',
      additions: 2,
      deletions: 1,
    })
    expect(files[1]).toMatchObject({
      path: 'file.ts',
      action: 'rename',
      additions: 0,
      deletions: 0,
    })
  })

  it('infers action for single write result', () => {
    const created = parseToolFileChanges({
      written: true,
      path: 'notes.txt',
      diff: '--- notes.txt\n+++ notes.txt\n@@ -0,0 +1 @@\n+hello',
      additions: 1,
      deletions: 0,
    })
    expect(created[0]?.action).toBe('create')

    const modified = parseToolFileChanges({
      written: true,
      path: 'notes.txt',
      diff: '--- notes.txt\n+++ notes.txt\n@@ -1 +1 @@\n-old\n+new',
      additions: 1,
      deletions: 1,
    })
    expect(modified[0]?.action).toBe('modify')
  })

  it('splits diff --git sections and falls back when path cannot be extracted', () => {
    const combined = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-a',
      '+A',
      'diff --git a/unknown b/unknown',
      '--- /dev/null',
      '+++ /dev/null',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n')

    const files = parseToolFileChanges({
      path: '/sandbox/base.txt',
      diff: combined,
      additions: 3,
      deletions: 1,
    })

    expect(splitUnifiedDiff(combined)).toHaveLength(2)
    expect(files).toHaveLength(2)
    expect(files[0]?.path).toBe('a.ts')
    expect(files[1]?.path).toBe('base.txt#2')
    expect((files[0]?.additions ?? 0) + (files[1]?.additions ?? 0)).toBe(3)
    expect((files[0]?.deletions ?? 0) + (files[1]?.deletions ?? 0)).toBe(1)
  })
})

describe('extractPathsFromPatchText', () => {
  it('collects paths from Index and +++ headers', () => {
    const patch = [
      'Index: src/a.ts',
      '--- src/a.ts',
      '+++ src/a.ts',
      '@@ -1 +1 @@',
      '-a',
      '+A',
      'Index: src/b.ts',
      '--- src/b.ts',
      '+++ src/b.ts',
      '@@ -1 +1 @@',
      '-b',
      '+B',
    ].join('\n')
    expect(extractPathsFromPatchText(patch)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('returns empty for blank patch text', () => {
    expect(extractPathsFromPatchText('')).toEqual([])
    expect(extractPathsFromPatchText('+++ /dev/null')).toEqual([])
  })
})
