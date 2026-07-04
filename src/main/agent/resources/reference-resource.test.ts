import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fakeSandbox, pathsEqual } from '@test-paths'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { ReferenceContext } from './context'
import { ReferenceDoc, ReferenceScript } from './reference-resource'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
}))

function refs() {
  return new ReferenceContext()
}

describe('ReferenceContext.isRemoteReferenceUrl', () => {
  it('detects http(s) URLs', () => {
    const r = refs()
    expect(r.isRemoteReferenceUrl('https://example.com/a')).toBe(true)
    expect(r.isRemoteReferenceUrl('HTTP://X')).toBe(true)
    expect(r.isRemoteReferenceUrl('/local/path')).toBe(false)
  })
})

describe('ReferenceContext.normalizeReferenceScriptType', () => {
  it('maps aliases to canonical types', () => {
    expect(ReferenceContext.normalizeReferenceScriptType('nodejs')).toBe('node')
    expect(ReferenceContext.normalizeReferenceScriptType('py')).toBe('python')
    expect(ReferenceContext.normalizeReferenceScriptType('sh')).toBe('bash')
    expect(ReferenceContext.normalizeReferenceScriptType('unknown')).toBe('bash')
  })
})

describe('ReferenceDoc / ReferenceScript', () => {
  it('fromPlain accepts path alias', () => {
    const r = refs()
    const doc = r.docFromPlain({ path: 'a.md' })
    expect(doc.toJSON()).toEqual({ reference_url: 'a.md' })
    const script = r.scriptFromPlain({ script_type: 'js', path: 's.js' })
    expect(script.script_type).toBe('node')
  })
})

describe('ReferenceContext ensure*', () => {
  it('returns instances unchanged', () => {
    const r = refs()
    const doc = new ReferenceDoc('u')
    expect(r.ensureReferenceDoc(doc)).toBe(doc)
    const script = new ReferenceScript('python', 'u')
    expect(r.ensureReferenceScript(script)).toBe(script)
  })

  it('wraps plain objects', () => {
    const r = refs()
    expect(r.ensureReferenceDoc({ name: 'legacy.md', reference_url: 'y' }).reference_url).toBe(
      'y',
    )
    expect(r.ensureReferenceDoc({ name: 'legacy-only.md' }).reference_url).toBe(
      'legacy-only.md',
    )
  })
})

describe('ReferenceContext.referenceLocationString', () => {
  it('prefers reference_url over path', () => {
    const r = refs()
    expect(r.referenceLocationString({ reference_url: 'a', path: 'b' })).toBe('a')
    expect(r.referenceLocationString({ path: 'b' })).toBe('b')
  })
})

describe('ReferenceContext.resolveReferenceUrlToFilesystemPath', () => {
  const sandbox = fakeSandbox()

  it('joins relative paths to sandbox root', () => {
    const r = refs()
    expect(
      r.resolveReferenceUrlToFilesystemPath('skills/x.md', sandbox),
    ).toBe(join(sandbox, 'skills', 'x.md'))
  })

  it('rejects remote URLs', () => {
    const r = refs()
    expect(() =>
      r.resolveReferenceUrlToFilesystemPath('https://x.com', sandbox),
    ).toThrow(/remote URL/)
  })
})

describe('ReferenceContext.resolveLocalSourcePathForReferenceCopy', () => {
  it('returns existing absolute path', () => {
    const abs = join(fakeSandbox(), 'abs', 'file.md')
    vi.mocked(existsSync).mockImplementation((p) => pathsEqual(String(p), abs))
    const r = refs()
    expect(
      r.resolveLocalSourcePathForReferenceCopy(abs, {
        skillsDir: join(fakeSandbox(), 'skills'),
        root: fakeSandbox(),
      }),
    ).toBe(abs)
  })
})

describe('ReferenceContext.resolveReferenceReadPathInSandbox', () => {
  const sandbox = fakeSandbox()
  const layout = {
    root: sandbox,
    refsDir: join(sandbox, 'refs'),
    skillsDir: join(sandbox, 'skills'),
  }

  it('prefers sandbox root over refs and skills', () => {
    const primary = join(sandbox, 'form', 'step.form.md')
    vi.mocked(existsSync).mockImplementation((p) =>
      [primary, join(sandbox, 'refs', 'form', 'step.form.md'), join(sandbox, 'skills', 'my-skill', 'form', 'step.form.md')].some(
        (candidate) => pathsEqual(String(p), candidate),
      ),
    )
    const r = refs()
    expect(
      r.resolveReferenceReadPathInSandbox('form/step.form.md', layout, 'my-skill'),
    ).toBe(primary)
  })

  it('falls back to refs copy by relative path', () => {
    const refPath = join(sandbox, 'refs', 'form', 'step.form.md')
    vi.mocked(existsSync).mockImplementation((p) => pathsEqual(String(p), refPath))
    const r = refs()
    expect(
      r.resolveReferenceReadPathInSandbox('form/step.form.md', layout, 'my-skill'),
    ).toBe(refPath)
  })

  it('falls back to refs copy by basename after materialize', () => {
    const refPath = join(sandbox, 'refs', 'step.form.md')
    vi.mocked(existsSync).mockImplementation((p) => pathsEqual(String(p), refPath))
    const r = refs()
    expect(
      r.resolveReferenceReadPathInSandbox('form/step.form.md', layout, 'my-skill'),
    ).toBe(refPath)
  })

  it('falls back to sandbox skill folder', () => {
    const skillPath = join(sandbox, 'skills', 'my-skill', 'hitl', 'step.form.md')
    vi.mocked(existsSync).mockImplementation((p) => pathsEqual(String(p), skillPath))
    const r = refs()
    expect(
      r.resolveReferenceReadPathInSandbox('hitl/step.form.md', layout, 'my-skill'),
    ).toBe(skillPath)
  })

  it('falls back to skillsDir without skillId prefix', () => {
    const sharedPath = join(sandbox, 'skills', 'shared', 'step.form.md')
    vi.mocked(existsSync).mockImplementation((p) => pathsEqual(String(p), sharedPath))
    const r = refs()
    expect(
      r.resolveReferenceReadPathInSandbox('shared/step.form.md', layout),
    ).toBe(sharedPath)
  })
})

describe('ReferenceDoc.loadContent', () => {
  it('loads local file content', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFile).mockResolvedValue('local body' as never)
    const doc = new ReferenceDoc('notes.md')
    const result = await doc.loadContent({ sandboxRoot: '/sandbox' })
    expect(result).toEqual({
      ok: true,
      body: 'local body',
      resolvedFrom: 'local',
    })
  })

  it('returns error when local file missing', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const doc = new ReferenceDoc('missing.md')
    const result = await doc.loadContent({ sandboxRoot: '/sandbox' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not found')
  })

  it('fetches remote URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/plain' },
        text: async () => 'remote text',
      })),
    )
    const doc = new ReferenceDoc('https://example.com/doc.txt')
    const ac = new AbortController()
    const result = await doc.loadContent({
      sandboxRoot: '/sandbox',
      abortSignal: ac.signal,
    })
    expect(result).toMatchObject({ ok: true, body: 'remote text', resolvedFrom: 'remote' })
  })
})

describe('ReferenceContext.writeRemoteReferenceToFile', () => {
  it('writes fetched body to destination', async () => {
    const { writeFile } = await import('fs/promises')
    const bytes = new TextEncoder().encode('saved')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer,
      })),
    )
    const ac = new AbortController()
    await refs().writeRemoteReferenceToFile('https://example.com/x.txt', '/dest/x.txt', {
      abortSignal: ac.signal,
    })
    expect(writeFile).toHaveBeenCalledWith('/dest/x.txt', Buffer.from(bytes))
  })
})
