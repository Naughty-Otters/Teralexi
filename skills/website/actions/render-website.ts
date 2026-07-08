/**
 * render_website — unified template router for the website skill.
 */

import Mustache from 'mustache'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'
import type { SkillTool } from '@teralexi/skill-sdk'
import {
  getOutputResultsRelPrefix,
  readSkillAttachment,
  requireActiveSandbox,
} from '@teralexi/skill-sdk'
import {
  WEBSITE_SKILL_ID,
  getTemplateById,
  loadManifest,
  normalizeRawToSiteData,
  resolveTheme,
  validateSiteData,
  type SiteData,
  type TemplateManifestEntry,
} from './template-core'

const DEFAULT_DATA_PATH = 'output/toolLoop/step-2b/results/site.json'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'site'
}

function readSiteJson(sandboxRoot: string, dataPath: string): SiteData {
  const abs = path.isAbsolute(dataPath)
    ? dataPath
    : path.join(sandboxRoot, dataPath)
  if (!fs.existsSync(abs)) {
    throw new Error(`data file not found: ${dataPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf-8'))
  return raw as SiteData
}

function loadTemplateFile(relativePath: string): string {
  const { content } = readSkillAttachment(WEBSITE_SKILL_ID, `templates/${relativePath}`)
  return content
}

function pageFilename(slug: string): string {
  return slug === 'index' ? 'index.html' : `${slug}.html`
}

function buildSinglePageContext(
  template: TemplateManifestEntry,
  data: SiteData,
): Record<string, unknown> {
  const style = (template.style ?? {}) as Record<string, unknown>
  const theme = resolveTheme(data.theme, String(style.theme ?? 'minimal-light'))
  const projects = data.projects ?? []
  return {
    ...data,
    meta: { lang: 'en', ...data.meta },
    theme,
    navItems: data.nav ?? [],
    projectsBlock: projects.length ? { items: projects } : undefined,
  }
}

function writeRenderedFile(
  siteDir: string,
  filename: string,
  content: string,
): string {
  const abs = path.join(siteDir, filename)
  fs.writeFileSync(abs, content, 'utf-8')
  return abs
}

function copySharedAssets(
  siteDir: string,
  template: TemplateManifestEntry,
  themeContext: Record<string, unknown>,
): void {
  if (template.css) {
    const cssSrc = loadTemplateFile(template.css)
    const css = Mustache.render(cssSrc, themeContext)
    writeRenderedFile(siteDir, 'styles.css', css)
  }
  if (template.js) {
    const js = loadTemplateFile(template.js)
    writeRenderedFile(siteDir, 'script.js', js)
  }
}

async function renderSinglePage(
  sandboxRoot: string,
  template: TemplateManifestEntry,
  data: SiteData,
  outputSlug: string,
): Promise<Record<string, unknown>> {
  const resultsDir = path.join(sandboxRoot, getOutputResultsRelPrefix())
  const siteDir = path.join(resultsDir, slugify(outputSlug))
  fs.mkdirSync(siteDir, { recursive: true })

  if (!template.html) return { error: 'Template missing html path' }

  const context = buildSinglePageContext(template, data)
  const htmlSrc = loadTemplateFile(template.html)
  const html = Mustache.render(htmlSrc, context)
  const indexPath = writeRenderedFile(siteDir, 'index.html', html)
  copySharedAssets(siteDir, template, { theme: context.theme })

  const relDir = path.relative(sandboxRoot, siteDir).split(path.sep).join('/')
  const previewUrl = pathToFileURL(indexPath).href

  return {
    success: true,
    site_dir: relDir,
    index_path: path.relative(sandboxRoot, indexPath).split(path.sep).join('/'),
    preview_url: previewUrl,
    preview_hint: 'Open the index.html preview link in chat to view the site.',
    message: `Website created: ${relDir}/index.html`,
  }
}

async function renderMultiPage(
  sandboxRoot: string,
  template: TemplateManifestEntry,
  data: SiteData,
  outputSlug: string,
): Promise<Record<string, unknown>> {
  const resultsDir = path.join(sandboxRoot, getOutputResultsRelPrefix())
  const siteDir = path.join(resultsDir, slugify(outputSlug))
  fs.mkdirSync(siteDir, { recursive: true })

  if (!template.page) return { error: 'Template missing page path' }

  const style = (template.style ?? {}) as Record<string, unknown>
  const theme = resolveTheme(data.theme, String(style.theme ?? 'docs-neutral'))
  const pageTemplate = loadTemplateFile(template.page)
  const pages = data.pages ?? []
  const nav = data.nav ?? []

  copySharedAssets(siteDir, template, { theme })

  for (const page of pages) {
    const filename = pageFilename(page.slug)
    const activeHref = filename
    const context = {
      siteTitle: data.title,
      tagline: data.tagline ?? data.meta?.description ?? '',
      metaDescription: data.meta?.description ?? '',
      meta: { lang: 'en', ...data.meta },
      pageTitle: page.title,
      sections: page.sections ?? [],
      nav: nav.map((item) => ({
        ...item,
        active: item.href === activeHref || item.href === page.slug,
      })),
      theme,
    }
    const html = Mustache.render(pageTemplate, context)
    writeRenderedFile(siteDir, filename, html)
  }

  const indexPath = path.join(siteDir, 'index.html')
  if (!fs.existsSync(indexPath) && pages.length) {
    const first = pages[0]
    const html = Mustache.render(pageTemplate, {
      siteTitle: data.title,
      tagline: data.tagline ?? '',
      metaDescription: data.meta?.description ?? '',
      meta: { lang: 'en', ...data.meta },
      pageTitle: first.title,
      sections: first.sections ?? [],
      nav,
      theme,
    })
    writeRenderedFile(siteDir, 'index.html', html)
  }

  const relDir = path.relative(sandboxRoot, siteDir).split(path.sep).join('/')
  const previewUrl = pathToFileURL(indexPath).href

  return {
    success: true,
    site_dir: relDir,
    index_path: path.relative(sandboxRoot, indexPath).split(path.sep).join('/'),
    page_count: pages.length,
    preview_url: previewUrl,
    preview_hint: 'Open the index.html preview link in chat to view the site.',
    message: `Website created: ${relDir}/ (${pages.length} pages)`,
  }
}

export const renderWebsite: SkillTool = {
  name: 'render_website',
  description:
    'Render a static website from a template manifest entry and normalized site.json. ' +
    'Writes HTML, CSS, and JS to output/results/<slug>/. Preferred step-3 entry point.',
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const templateId = String(input['template_id'] ?? '').trim()
    const outputSlug = String(input['output_slug'] ?? 'site').trim()
    const dataPath = String(input['data_path'] ?? DEFAULT_DATA_PATH).trim()

    if (!templateId) return { error: 'template_id is required' }

    const manifest = loadManifest()
    const template = getTemplateById(manifest, templateId)
    if (!template) {
      return { error: `Unknown template_id: ${templateId}` }
    }

    let data: SiteData
    try {
      const raw = readSiteJson(sandbox.root, dataPath)
      data = normalizeRawToSiteData(template, raw as Record<string, unknown>, outputSlug)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }

    const validationError = validateSiteData(template, data)
    if (validationError) return { error: validationError }

    try {
      if (template.renderer === 'multi') {
        return await renderMultiPage(sandbox.root, template, data, outputSlug)
      }
      return await renderSinglePage(sandbox.root, template, data, outputSlug)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
}
