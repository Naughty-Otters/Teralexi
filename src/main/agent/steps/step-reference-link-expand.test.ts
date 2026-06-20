import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

vi.mock('@main/skills/skill-path', () => ({
  resolveSkillsSources: vi.fn(() => ({
    bundled: '/skills-root',
    user: '/mock/.openfde/skills',
  })),
}))

import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { ReferenceContext } from '../resources/context'
import {
  appendLinkedMarkdownReferenceSections,
  collectPlannedReferenceHrefKeys,
  extractMarkdownLinks,
  isExpandableReferenceTextHref,
  normalizeMarkdownHrefKey,
  REFERENCE_LINK_TEXT_EXTENSIONS,
} from './step-reference-link-expand'

const testReferences = new ReferenceContext()

describe('isExpandableReferenceTextHref', () => {
  it('allows known text extensions', () => {
    expect(isExpandableReferenceTextHref('docs/readme.md', testReferences)).toBe(true)
    expect(REFERENCE_LINK_TEXT_EXTENSIONS.has('.md')).toBe(true)
  })

  it('allows extensionless paths', () => {
    expect(isExpandableReferenceTextHref('README', testReferences)).toBe(true)
  })

  it('rejects non-text extensions', () => {
    expect(isExpandableReferenceTextHref('image.png', testReferences)).toBe(false)
  })
})

describe('normalizeMarkdownHrefKey', () => {
  it('normalizes remote URLs without hash', () => {
    expect(
      normalizeMarkdownHrefKey('https://Example.com/doc.md#section', testReferences),
    ).toBe('https://example.com/doc.md')
  })

  it('normalizes local paths', () => {
    expect(normalizeMarkdownHrefKey('.\\Skills\\A.md', testReferences)).toBe('skills/a.md')
  })

  it('falls back to lowercased raw href on invalid URL', () => {
    expect(normalizeMarkdownHrefKey('not a valid url %%%', testReferences)).toBe(
      'not a valid url %%%',
    )
  })
})

describe('collectPlannedReferenceHrefKeys', () => {
  it('collects normalized keys from docs and scripts', () => {
    const keys = collectPlannedReferenceHrefKeys(
      testReferences,
      [{ reference_url: 'docs/A.md' }],
      [{ reference_url: 'https://Example.com/x.py' }],
    )
    expect(keys.has('docs/a.md')).toBe(true)
    expect(keys.has('https://example.com/x.py')).toBe(true)
  })
})

describe('extractMarkdownLinks', () => {
  it('extracts links and skips images and mailto', () => {
    const text = [
      'See [doc](readme.md) and [dup](readme.md).',
      '![img](pic.png)',
      '[mail](mailto:a@b.com)',
      '[js](lib/app.js)',
    ].join('\n')
    const links = extractMarkdownLinks(text, testReferences)
    expect(links.map((l) => l.href)).toEqual(['readme.md', 'lib/app.js'])
  })

  it('returns empty when no links', () => {
    expect(extractMarkdownLinks('plain text', testReferences)).toEqual([])
  })
})

describe('appendLinkedMarkdownReferenceSections', () => {
  const cache = new Map<string, string>()

  function makeCtx() {
    return {
      references: Object.assign(testReferences, {
        resolveLocalSourcePathForReferenceCopy: vi.fn(() => null),
      }),
      opts: { skillId: 'demo', abortSignal: undefined },
      sandbox: {
        layout: {
          root: '/sandbox',
          skillsDir: '/sandbox/skills',
          refsDir: '/sandbox/refs',
          scriptsDir: '/sandbox/scripts',
          outputDir: '/sandbox/output',
        },
      },
      getCachedMarkdownReferenceBody: (key: string) => cache.get(key),
      cacheMarkdownReferenceBody: (key: string, body: string) => {
        cache.set(key, body)
      },
    }
  }

  beforeEach(() => {
    cache.clear()
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFile).mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => 'remote body',
        json: async () => ({ ok: true }),
      })),
    )
  })

  it('returns system unchanged when no links', async () => {
    const system = 'no links here'
    await expect(
      appendLinkedMarkdownReferenceSections(system, makeCtx() as never),
    ).resolves.toBe(system)
  })

  it('inlines local file bodies and uses cache on repeat', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFile).mockResolvedValue('# Title\nbody' as never)

    const system = 'Read [guide](guide.md) once.'
    const ctx = makeCtx()
    const out1 = await appendLinkedMarkdownReferenceSections(
      system,
      ctx as never,
    )
    expect(out1).toContain('body')
    expect(out1).toContain('guide.md')
    expect(readFile).toHaveBeenCalled()

    const out2 = await appendLinkedMarkdownReferenceSections(
      system,
      ctx as never,
    )
    expect(out2).toContain('body')
    expect(readFile).toHaveBeenCalledTimes(1)
  })

  it('fetches remote https links', async () => {
    const system = 'See [api](https://example.com/readme.md).'
    const out = await appendLinkedMarkdownReferenceSections(
      system,
      makeCtx() as never,
    )
    expect(out).toContain('remote body')
    expect(fetch).toHaveBeenCalled()
  })

  it('skips href keys listed in skipExpandHrefKeys', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFile).mockResolvedValue('skipped' as never)
    const system = 'See [doc](guide.md).'
    const out = await appendLinkedMarkdownReferenceSections(
      system,
      makeCtx() as never,
      { skipExpandHrefKeys: new Set(['guide.md']) },
    )
    expect(out).toBe(system)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('skips non-text extensions like images', async () => {
    const system = 'See [pic](photo.png).'
    const out = await appendLinkedMarkdownReferenceSections(
      system,
      makeCtx() as never,
    )
    expect(out).toBe(system)
  })
})
