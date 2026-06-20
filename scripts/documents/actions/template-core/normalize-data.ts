import type {
  DocumentData,
  DocumentSection,
  DocumentSheet,
  DocumentSlide,
  DocumentTable,
  TemplateManifestEntry,
} from './types'

function parseSectionsOutline(raw: string): DocumentSection[] {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) return { heading: line.trim(), body: '', level: 1 }
      return {
        heading: line.slice(0, colonIdx).trim(),
        body: line.slice(colonIdx + 1).trim(),
        level: 1,
      }
    })
}

function parseSlidesOutline(raw: string): DocumentSlide[] {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) return { title: line.trim(), bullets: [] }
      const title = line.slice(0, colonIdx).trim()
      const bullets = line
        .slice(colonIdx + 1)
        .split('|')
        .map((b) => b.trim())
        .filter(Boolean)
      return { title, bullets }
    })
}

function parseTableData(raw: unknown): DocumentTable | undefined {
  if (typeof raw === 'string') {
    const lines = raw.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return undefined
    return {
      headers: lines[0].split(',').map((s) => s.trim()),
      rows: lines.slice(1).map((l) => l.split(',').map((s) => s.trim())),
    }
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const headers = Array.isArray(o.headers) ? o.headers.map(String) : []
    const rows = Array.isArray(o.rows)
      ? (o.rows as unknown[]).map((r) =>
          Array.isArray(r) ? r.map(String) : [String(r)],
        )
      : []
    if (!headers.length) return undefined
    return { headers, rows }
  }
  return undefined
}

function parseRows(raw: unknown): (string | number)[][] {
  if (Array.isArray(raw)) return raw as (string | number)[][]
  if (typeof raw === 'string') {
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(',').map((v) => v.trim()))
  }
  return []
}

function parseColumns(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/** Normalize inline form fields into canonical data.json for a template. */
export function normalizeFormToDocumentData(
  template: TemplateManifestEntry,
  form: Record<string, unknown>,
  docTitle: string,
): DocumentData {
  const title = String(form.title ?? docTitle ?? 'Document').trim() || 'Document'
  const meta = {
    author: form.author ? String(form.author) : undefined,
    date: form.date ? String(form.date) : undefined,
    presenter: form.presenter ? String(form.presenter) : undefined,
  }

  if (template.renderer === 'excel' || template.doc_types.includes('excel')) {
    return {
      title,
      meta,
      sheet: {
        columns: parseColumns(form.columns),
        rows: parseRows(form.rows),
        sheet_name: form.sheet_name ? String(form.sheet_name) : undefined,
      },
    }
  }

  if (template.renderer === 'powerpoint' || template.doc_types.includes('powerpoint')) {
    const outline = form.slides_outline ?? form.slides
    const slides =
      typeof outline === 'string'
        ? parseSlidesOutline(outline)
        : Array.isArray(outline)
          ? (outline as DocumentSlide[])
          : []
    return {
      title: String(form.presentation_title ?? title),
      meta: {
        ...meta,
        presenter: form.presenter ? String(form.presenter) : meta.presenter,
      },
      slides,
    }
  }

  const sectionsRaw = form.sections
  const sections =
    typeof sectionsRaw === 'string'
      ? parseSectionsOutline(sectionsRaw)
      : Array.isArray(sectionsRaw)
        ? (sectionsRaw as DocumentSection[])
        : []

  const table =
    form.include_table && form.table_data
      ? parseTableData(form.table_data)
      : parseTableData(form.table)

  return {
    title,
    meta,
    sections,
    table,
  }
}

/** Normalize raw file JSON or legacy shapes into canonical data.json. */
export function normalizeRawToDocumentData(
  template: TemplateManifestEntry,
  raw: unknown,
  docTitle: string,
): DocumentData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('data.json must be a JSON object')
  }
  const o = raw as Record<string, unknown>

  if (o.title && (o.sections || o.slides || o.sheet)) {
    return o as DocumentData
  }

  if (template.renderer === 'excel' || o.columns) {
    return {
      title: String(o.title ?? docTitle),
      sheet: {
        columns: parseColumns(o.columns),
        rows: parseRows(o.rows),
        sheet_name: o.sheet_name ? String(o.sheet_name) : undefined,
      },
    }
  }

  if (template.renderer === 'powerpoint' || o.slides) {
    return {
      title: String(o.presentation_title ?? o.title ?? docTitle),
      meta: { presenter: o.presenter ? String(o.presenter) : undefined },
      slides: Array.isArray(o.slides) ? (o.slides as DocumentSlide[]) : [],
    }
  }

  return {
    title: String(o.title ?? docTitle),
    meta: { author: o.author ? String(o.author) : undefined },
    sections: Array.isArray(o.sections)
      ? (o.sections as DocumentSection[])
      : typeof o.sections === 'string'
        ? parseSectionsOutline(o.sections)
        : [],
    table: parseTableData(o.table_data ?? o.table),
  }
}

export function validateDocumentData(
  template: TemplateManifestEntry,
  data: DocumentData,
): string | null {
  if (!data.title?.trim()) return 'title is required'
  switch (template.renderer) {
    case 'excel':
      if (!data.sheet?.columns?.length) return 'sheet.columns is required'
      if (!data.sheet?.rows) return 'sheet.rows is required'
      return null
    case 'powerpoint':
      if (!data.slides?.length) return 'slides is required'
      return null
    case 'html':
    case 'word':
      if (!data.sections?.length) return 'sections is required'
      return null
    default:
      return null
  }
}
