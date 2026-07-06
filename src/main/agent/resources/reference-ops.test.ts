import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fakeSandbox, isWin } from '@test-paths'
import {
  ensureReferenceDoc,
  ensureReferenceScript,
  isRemoteReferenceUrl,
  normalizeReferenceScriptType,
  referenceDocBasename,
  referenceLocationString,
  resolveLocalSourcePathForReferenceCopy,
  resolveReferenceReadPathInSandbox,
  resolveReferenceUrlToFilesystemPath,
  writeRemoteReferenceToFile,
} from './reference-ops'
import { ReferenceDoc, ReferenceScript } from './reference-resource'

describe('reference-ops helpers', () => {
  const sandbox = fakeSandbox()

  it('detects remote URLs and resolves local paths', () => {
    expect(isRemoteReferenceUrl('https://example.com/a.md')).toBe(true)
    expect(isRemoteReferenceUrl('./local.md')).toBe(false)
    expect(resolveReferenceUrlToFilesystemPath('docs/a.md', sandbox)).toBe(
      join(sandbox, 'docs/a.md'),
    )
    expect(() => resolveReferenceUrlToFilesystemPath('https://x', sandbox)).toThrow(
      /remote URL/,
    )
  })

  it('normalizes script types', () => {
    expect(normalizeReferenceScriptType('js')).toBe('node')
    expect(normalizeReferenceScriptType('py')).toBe('python')
    expect(normalizeReferenceScriptType('zsh')).toBe('bash')
    expect(normalizeReferenceScriptType(undefined)).toBe('bash')
  })

  it('wraps plain reference objects', () => {
    const doc = ReferenceDoc.fromPlain({ name: 'Doc', reference_url: 'docs/a.md' })
    expect(referenceLocationString(doc)).toBe('docs/a.md')
    expect(referenceDocBasename('docs/readme.md?x=1')).toBe('readme.md')
    expect(ensureReferenceDoc(doc)).toBe(doc)
    expect(ensureReferenceDoc({ reference_url: 'docs/b.md' })).toBeInstanceOf(ReferenceDoc)
    expect(ensureReferenceScript({ script_type: 'py', reference_url: 'run.py' })).toBeInstanceOf(
      ReferenceScript,
    )
  })

  it('resolves absolute local paths', () => {
    const abs = isWin ? 'C:\\abs\\path.md' : '/abs/path.md'
    expect(resolveReferenceUrlToFilesystemPath(abs, sandbox)).toBe(abs)
  })
})

describe('resolveReferenceReadPathInSandbox', () => {
  let root: string
  let layout: { root: string; refsDir: string; skillsDir: string }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'teralexi-ref-'))
    layout = {
      root,
      refsDir: join(root, 'refs'),
      skillsDir: join(root, 'skills'),
    }
    mkdirSync(layout.refsDir, { recursive: true })
    mkdirSync(layout.skillsDir, { recursive: true })
  })

  it('finds files under sandbox root and refs dir', () => {
    const target = join(root, 'notes.md')
    writeFileSync(target, 'hello')
    expect(resolveReferenceReadPathInSandbox('notes.md', layout)).toBe(target)

    const refCopy = join(layout.refsDir, 'guide.md')
    writeFileSync(refCopy, 'guide')
    expect(resolveReferenceReadPathInSandbox('guide.md', layout)).toBe(refCopy)
  })

  it('searches nested skill directories by basename', () => {
    const skillDir = join(layout.skillsDir, 'demo-skill', 'scripts')
    mkdirSync(skillDir, { recursive: true })
    const script = join(skillDir, 'run.py')
    writeFileSync(script, 'print(1)')
    expect(
      resolveReferenceReadPathInSandbox('scripts/run.py', layout, 'demo-skill'),
    ).toBe(script)
  })

  it('returns null for remote URLs', () => {
    expect(resolveReferenceReadPathInSandbox('https://x/y', layout)).toBeNull()
  })
})

describe('resolveLocalSourcePathForReferenceCopy', () => {
  it('prefers skill-local paths when skillId is provided', () => {
    const root = mkdtempSync(join(tmpdir(), 'teralexi-ref-copy-'))
    const skillsDir = join(root, 'skills')
    const skillRoot = join(skillsDir, 'demo')
    mkdirSync(skillRoot, { recursive: true })
    const file = join(skillRoot, 'script.py')
    writeFileSync(file, 'x')

    expect(
      resolveLocalSourcePathForReferenceCopy('script.py', { root, skillsDir }, 'demo'),
    ).toBe(file)
  })
})

describe('writeRemoteReferenceToFile', () => {
  it('downloads remote content to disk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('remote body').buffer,
      })),
    )

    const dest = join(tmpdir(), `remote-ref-${Date.now()}.txt`)
    await writeRemoteReferenceToFile('https://example.com/file.txt', dest)
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(dest, 'utf8')).toBe('remote body')
    vi.unstubAllGlobals()
  })

  it('throws when remote fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )

    await expect(
      writeRemoteReferenceToFile('https://example.com/missing.txt', join(tmpdir(), 'x.txt')),
    ).rejects.toThrow(/HTTP 404/)
    vi.unstubAllGlobals()
  })
})
