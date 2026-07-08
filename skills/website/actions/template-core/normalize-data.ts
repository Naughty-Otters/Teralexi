import type {
  SiteData,
  SiteNavItem,
  SitePage,
  SiteSection,
  TemplateManifestEntry,
} from './types'

function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

function parseSectionsOutline(raw: string): SiteSection[] {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) {
        return { id: slugifyId(line), heading: line.trim(), body: '' }
      }
      const heading = line.slice(0, colonIdx).trim()
      const rest = line.slice(colonIdx + 1).trim()
      if (rest.includes('|')) {
        const items = rest
          .split('|')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((title) => ({ title, body: '' }))
        return { id: slugifyId(heading), heading, items }
      }
      return { id: slugifyId(heading), heading, body: rest }
    })
}

function parseProjectsOutline(raw: string) {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) return { title: line.trim(), description: '' }
      const title = line.slice(0, colonIdx).trim()
      const rest = line.slice(colonIdx + 1).trim()
      const pipeIdx = rest.lastIndexOf('|')
      if (pipeIdx < 0) return { title, description: rest }
      return {
        title,
        description: rest.slice(0, pipeIdx).trim(),
        url: rest.slice(pipeIdx + 1).trim(),
      }
    })
}

function parsePagesOutline(raw: string): SitePage[] {
  const pages: SitePage[] = []
  let current: SitePage | null = null

  for (const line of raw.trim().split('\n')) {
    if (!line.trim()) continue
    if (!line.startsWith(' ') && line.includes('|')) {
      const [slug, title] = line.split('|').map((s) => s.trim())
      current = { slug: slug || 'index', title: title || slug, sections: [] }
      pages.push(current)
      continue
    }
    if (!current) continue
    const trimmed = line.trim()
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 0) {
      current.sections?.push({ heading: trimmed, body: '' })
    } else {
      current.sections?.push({
        heading: trimmed.slice(0, colonIdx).trim(),
        body: trimmed.slice(colonIdx + 1).trim(),
      })
    }
  }

  return pages
}

function defaultNavFromSections(sections: SiteSection[]): SiteNavItem[] {
  return sections
    .filter((s) => s.id)
    .map((s) => ({ label: s.heading, href: `#${s.id}` }))
}

function defaultNavFromPages(pages: SitePage[]): SiteNavItem[] {
  return pages.map((p) => ({
    label: p.title,
    href: p.slug === 'index' ? 'index.html' : `${p.slug}.html`,
  }))
}

export function normalizeFormToSiteData(
  template: TemplateManifestEntry,
  form: Record<string, unknown>,
  siteTitle: string,
): SiteData {
  const title = String(form.site_title ?? siteTitle ?? 'Website').trim() || 'Website'
  const meta = {
    description: form.meta_description ? String(form.meta_description) : undefined,
    lang: 'en',
  }

  if (template.renderer === 'multi') {
    const pages = parsePagesOutline(String(form.pages_outline ?? ''))
    if (!pages.length) {
      throw new Error('pages_outline is required for multi-page sites')
    }
    return {
      title,
      tagline: form.site_description ? String(form.site_description) : undefined,
      meta,
      nav: defaultNavFromPages(pages),
      pages,
    }
  }

  const sections = parseSectionsOutline(String(form.sections_outline ?? ''))
  const projectsRaw = String(form.projects_outline ?? '').trim()
  const data: SiteData = {
    title,
    meta,
    hero: {
      headline: String(form.headline ?? title),
      subheadline: form.subheadline ? String(form.subheadline) : undefined,
      cta:
        form.cta_label && String(form.cta_label).trim()
          ? {
              label: String(form.cta_label),
              href: String(form.cta_href ?? '#contact'),
            }
          : undefined,
    },
    sections,
    nav: defaultNavFromSections(sections),
  }

  if (projectsRaw) data.projects = parseProjectsOutline(projectsRaw)
  if (form.contact_email) {
    data.contact = { email: String(form.contact_email) }
  }

  return data
}

export function normalizeRawToSiteData(
  template: TemplateManifestEntry,
  raw: Record<string, unknown>,
  siteTitle: string,
): SiteData {
  const title = String(raw.title ?? siteTitle ?? 'Website').trim() || 'Website'
  const style = (template.style ?? {}) as Record<string, unknown>
  const data: SiteData = {
    ...raw,
    title,
    theme: raw.theme ? String(raw.theme) : String(style.theme ?? ''),
    meta: {
      lang: 'en',
      ...(raw.meta as SiteData['meta']),
    },
  } as SiteData

  if (template.renderer === 'single' && !data.nav?.length && data.sections?.length) {
    data.nav = defaultNavFromSections(data.sections)
  }
  if (template.renderer === 'multi' && !data.nav?.length && data.pages?.length) {
    data.nav = defaultNavFromPages(data.pages)
  }

  for (const section of data.sections ?? []) {
    if (!section.id) section.id = slugifyId(section.heading)
  }

  return data
}

export function validateSiteData(
  template: TemplateManifestEntry,
  data: SiteData,
): string | null {
  if (!data.title?.trim()) return 'site.json: title is required'

  if (template.renderer === 'multi') {
    if (!data.pages?.length) return 'site.json: pages array is required for multi-page templates'
    return null
  }

  if (!data.hero?.headline?.trim() && !data.sections?.length) {
    return 'site.json: hero.headline or sections required for single-page templates'
  }

  return null
}
