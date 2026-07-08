import fs from 'fs'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { MANIFEST_RAW, MINIMAL_HTML, MINIMAL_CSS, PAGE_HTML, THEMES_RAW, SITE_JSON } =
  vi.hoisted(() => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { resolve } = require('node:path') as typeof import('node:path')
    const root = resolve(__dirname, '..')
    return {
      MANIFEST_RAW: readFileSync(resolve(root, 'templates/manifest.json'), 'utf-8'),
      MINIMAL_HTML: readFileSync(
        resolve(root, 'templates/landing/minimal/index.html'),
        'utf-8',
      ),
      MINIMAL_CSS: readFileSync(
        resolve(root, 'templates/landing/minimal/styles.css'),
        'utf-8',
      ),
      PAGE_HTML: readFileSync(resolve(root, 'templates/multi/docs/page.html'), 'utf-8'),
      THEMES_RAW: readFileSync(resolve(root, 'templates/styles/themes.json'), 'utf-8'),
      SITE_JSON: JSON.stringify({
        title: 'Test Site',
        meta: { description: 'A test', lang: 'en' },
        hero: { headline: 'Hello', subheadline: 'World' },
        sections: [{ id: 'about', heading: 'About', body: 'Copy' }],
        pages: [
          { slug: 'index', title: 'Home', sections: [{ heading: 'Welcome', body: 'Hi' }] },
          { slug: 'guide', title: 'Guide', sections: [{ heading: 'Start', body: 'Go' }] },
        ],
      }),
    }
  })

vi.mock('@teralexi/skill-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@teralexi/skill-sdk')>()
  return {
    ...actual,
    requireActiveSandbox: () => ({ ok: true, root: '/tmp/sandbox-test' }),
    getOutputResultsRelPrefix: () => 'output/results',
    readSkillAttachment: vi.fn((_skillId: string, relPath: string) => {
      if (relPath === 'templates/manifest.json') {
        return { content: MANIFEST_RAW, encoding: 'utf8' as const, mimeType: 'application/json' }
      }
      if (relPath === 'templates/landing/minimal/index.html') {
        return { content: MINIMAL_HTML, encoding: 'utf8' as const, mimeType: 'text/html' }
      }
      if (relPath === 'templates/landing/minimal/styles.css') {
        return { content: MINIMAL_CSS, encoding: 'utf8' as const, mimeType: 'text/css' }
      }
      if (relPath === 'templates/multi/docs/page.html') {
        return { content: PAGE_HTML, encoding: 'utf8' as const, mimeType: 'text/html' }
      }
      if (relPath === 'templates/multi/docs/styles.css') {
        return { content: MINIMAL_CSS, encoding: 'utf8' as const, mimeType: 'text/css' }
      }
      if (relPath === 'templates/shared/base.js') {
        return { content: '// test js', encoding: 'utf8' as const, mimeType: 'text/javascript' }
      }
      if (relPath === 'templates/styles/themes.json') {
        return { content: THEMES_RAW, encoding: 'utf8' as const, mimeType: 'application/json' }
      }
      throw new Error(`unexpected attachment: ${relPath}`)
    }),
  }
})

import { renderWebsite } from './render-website'
import { validateWebsite } from './validate-website'

describe('render_website', () => {
  beforeEach(() => {
    fs.mkdirSync('/tmp/sandbox-test/output/toolLoop/step-2b/results', { recursive: true })
    fs.mkdirSync('/tmp/sandbox-test/output/results', { recursive: true })
    fs.writeFileSync(
      '/tmp/sandbox-test/output/toolLoop/step-2b/results/site.json',
      SITE_JSON,
      'utf-8',
    )
  })

  it('renders a single-page landing site', async () => {
    const result = await renderWebsite.execute({
      template_id: 'landing-minimal',
      output_slug: 'Test Site',
      data_path: 'output/toolLoop/step-2b/results/site.json',
    })

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(fs.existsSync('/tmp/sandbox-test/output/results/test-site/index.html')).toBe(true)
    expect(fs.existsSync('/tmp/sandbox-test/output/results/test-site/styles.css')).toBe(true)
    const html = fs.readFileSync(
      '/tmp/sandbox-test/output/results/test-site/index.html',
      'utf-8',
    )
    expect(html).toContain('Hello')
    expect(html).toContain('lang="en"')
  })

  it('renders a multi-page docs site', async () => {
    const result = await renderWebsite.execute({
      template_id: 'docs-site',
      output_slug: 'docs',
      data_path: 'output/toolLoop/step-2b/results/site.json',
    })

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(fs.existsSync('/tmp/sandbox-test/output/results/docs/index.html')).toBe(true)
    expect(fs.existsSync('/tmp/sandbox-test/output/results/docs/guide.html')).toBe(true)
  })

  it('rejects unknown template_id', async () => {
    const result = await renderWebsite.execute({
      template_id: 'missing',
      output_slug: 'x',
    })
    expect(result.error).toContain('Unknown template_id')
  })
})

describe('validate_website', () => {
  beforeEach(() => {
    const dir = '/tmp/sandbox-test/output/results/valid-site'
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      pathJoin(dir, 'index.html'),
      '<!doctype html><html lang="en"><head><title>T</title><link rel="stylesheet" href="styles.css"></head><body><main>ok</main></body></html>',
      'utf-8',
    )
    fs.writeFileSync(pathJoin(dir, 'styles.css'), 'body{}', 'utf-8')
  })

  it('passes a valid site directory', async () => {
    const result = await validateWebsite.execute({
      site_dir: 'output/results/valid-site',
    })
    expect(result.valid).toBe(true)
    expect(result.success).toBe(true)
  })
})

function pathJoin(...parts: string[]): string {
  return parts.join('/')
}
