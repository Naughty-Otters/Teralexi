export const DOCUMENTS_SKILL_ID = 'documents'

export type DocumentRenderer = 'html' | 'excel' | 'powerpoint' | 'word'

export type TemplateManifestEntry = {
  id: string
  label: string
  doc_types: string[]
  schema: string
  renderer: DocumentRenderer
  html?: string
  style?: Record<string, unknown>
}

export type TemplateManifest = {
  templates: TemplateManifestEntry[]
}

export type DocumentMeta = {
  author?: string
  date?: string
  presenter?: string
}

export type DocumentSection = {
  heading: string
  body: string
  level?: number
}

export type DocumentSlide = {
  title: string
  bullets?: string[]
  notes?: string
}

export type DocumentSheet = {
  columns: string[]
  rows: (string | number)[][]
  sheet_name?: string
}

export type DocumentTable = {
  headers: string[]
  rows: string[][]
}

/** Canonical data.json envelope for all document templates. */
export type DocumentData = {
  title: string
  meta?: DocumentMeta
  sections?: DocumentSection[]
  slides?: DocumentSlide[]
  sheet?: DocumentSheet
  table?: DocumentTable
}

export type PptThemeColors = {
  bg: string
  title: string
  body: string
  accent: string
}

export type ExcelThemeStyle = {
  header: { fill: string; font: string; size?: number; bold?: boolean }
  rows: { alternate: string[] }
  numbers?: { format?: string; align?: string }
  grid?: { freezeHeader?: boolean }
}
