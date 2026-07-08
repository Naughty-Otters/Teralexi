export const WEBSITE_SKILL_ID = 'website'

export type SiteRenderer = 'single' | 'multi'

export type TemplateManifestEntry = {
  id: string
  label: string
  site_types: string[]
  schema: string
  renderer: SiteRenderer
  html?: string
  layout?: string
  page?: string
  css?: string
  js?: string
  style?: Record<string, unknown>
}

export type TemplateManifest = {
  templates: TemplateManifestEntry[]
}

export type SiteMeta = {
  description?: string
  author?: string
  lang?: string
}

export type SiteNavItem = {
  label: string
  href: string
}

export type SiteHero = {
  headline?: string
  subheadline?: string
  cta?: { label: string; href: string }
}

export type SiteSectionItem = {
  title: string
  body: string
}

export type SiteSection = {
  id?: string
  heading: string
  body?: string
  items?: SiteSectionItem[]
}

export type SiteProject = {
  title: string
  description?: string
  url?: string
}

export type SitePage = {
  slug: string
  title: string
  sections?: Array<{ heading: string; body?: string }>
}

export type SiteContact = {
  email?: string
  social?: Array<{ label: string; url: string }>
}

/** Canonical site.json envelope for all website templates. */
export type SiteData = {
  title: string
  meta?: SiteMeta
  theme?: string
  nav?: SiteNavItem[]
  hero?: SiteHero
  sections?: SiteSection[]
  projects?: SiteProject[]
  pages?: SitePage[]
  contact?: SiteContact
  tagline?: string
}

export type ThemeTokens = {
  bg: string
  surface: string
  text: string
  textMuted: string
  accent: string
  accentHover: string
  border: string
  fontSans: string
}

export type ThemeMap = Record<string, ThemeTokens>
