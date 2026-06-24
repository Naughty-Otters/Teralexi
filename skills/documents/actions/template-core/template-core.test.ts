import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import Mustache from 'mustache'
import {
  getTemplateById,
  listTemplateIds,
  loadManifest,
  parseManifestJson,
} from './load-manifest'
import { resolveExcelTheme, resolvePptTheme } from './load-themes'
import {
  normalizeFormToDocumentData,
  normalizeRawToDocumentData,
  validateDocumentData,
} from './normalize-data'
import {
  mapToPresentationInput,
  mapToSpreadsheetInput,
  mapToWordDocInput,
} from './map-to-tool-input'
import type { TemplateManifestEntry } from './types'

const SKILLS_ROOT = resolve(__dirname, '../..')
const MANIFEST_RAW = readFileSync(
  resolve(SKILLS_ROOT, 'templates/manifest.json'),
  'utf-8',
)
const HTML_TEMPLATE = readFileSync(
  resolve(SKILLS_ROOT, 'templates/html/corporate-report.html'),
  'utf-8',
)

/** template_id values in doc-request.form.md — keep in sync with manifest.json */
const FORM_TEMPLATE_IDS = [
  'corporate-report-pdf',
  'sales-dashboard',
  'navy-roadmap-deck',
  'formal-brief',
]

vi.mock('@openfde/skill-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openfde/skill-sdk')>()
  return {
    ...actual,
    readSkillAttachment: vi.fn((skillId: string, relPath: string) => {
    const full = resolve(SKILLS_ROOT, relPath.replace(/^templates\//, 'templates/'))
    if (relPath === 'templates/manifest.json') {
      return { content: MANIFEST_RAW, encoding: 'utf8' as const, mimeType: 'application/json' }
    }
    if (relPath === 'templates/styles/ppt-themes.json') {
      return {
        content: readFileSync(resolve(SKILLS_ROOT, 'templates/styles/ppt-themes.json'), 'utf-8'),
        encoding: 'utf8' as const,
        mimeType: 'application/json',
      }
    }
    if (relPath === 'templates/styles/excel-themes.json') {
      return {
        content: readFileSync(resolve(SKILLS_ROOT, 'templates/styles/excel-themes.json'), 'utf-8'),
        encoding: 'utf8' as const,
        mimeType: 'application/json',
      }
    }
    throw new Error(`Unexpected attachment: ${skillId}/${relPath} -> ${full}`)
  }),
  }
})

describe('template manifest', () => {
  it('parses bundled manifest.json', () => {
    const manifest = parseManifestJson(MANIFEST_RAW)
    expect(manifest.templates).toHaveLength(4)
    expect(listTemplateIds(manifest)).toEqual(FORM_TEMPLATE_IDS)
  })

  it('form template_id options are subset of manifest ids', () => {
    const manifest = parseManifestJson(MANIFEST_RAW)
    const ids = new Set(listTemplateIds(manifest))
    for (const formId of FORM_TEMPLATE_IDS) {
      expect(ids.has(formId)).toBe(true)
    }
  })

  it('loads manifest via readSkillAttachment', () => {
    const manifest = loadManifest()
    expect(getTemplateById(manifest, 'sales-dashboard')?.renderer).toBe('excel')
  })
})

describe('theme resolution', () => {
  it('resolves navy ppt theme colors', () => {
    const theme = resolvePptTheme('navy')
    expect(theme.bg).toBe('1F397B')
    expect(theme.accent).toBe('5BA3E0')
  })

  it('resolves corporate-blue excel theme', () => {
    const theme = resolveExcelTheme('corporate-blue')
    expect(theme.header.fill).toBe('2E75B6')
    expect(theme.rows.alternate).toEqual(['F5F8FD', 'FFFFFF'])
  })
})

describe('normalize-data', () => {
  const excelTemplate = getTemplateById(
    parseManifestJson(MANIFEST_RAW),
    'sales-dashboard',
  ) as TemplateManifestEntry

  const deckTemplate = getTemplateById(
    parseManifestJson(MANIFEST_RAW),
    'navy-roadmap-deck',
  ) as TemplateManifestEntry

  const reportTemplate = getTemplateById(
    parseManifestJson(MANIFEST_RAW),
    'corporate-report-pdf',
  ) as TemplateManifestEntry

  it('normalizes excel form fields to sheet block', () => {
    const data = normalizeFormToDocumentData(
      excelTemplate,
      {
        columns: 'Month, Revenue',
        rows: 'Jan, 100\nFeb, 200',
      },
      'Q1 Sales',
    )
    expect(data.sheet?.columns).toEqual(['Month', 'Revenue'])
    expect(data.sheet?.rows).toHaveLength(2)
    expect(validateDocumentData(excelTemplate, data)).toBeNull()
  })

  it('normalizes presentation outline string', () => {
    const data = normalizeFormToDocumentData(
      deckTemplate,
      {
        presentation_title: 'Roadmap',
        presenter: 'Team',
        slides_outline: 'Intro: Why now | Goals\nPlan: Step 1 | Step 2',
      },
      'Roadmap',
    )
    expect(data.slides).toHaveLength(2)
    expect(data.slides?.[0].bullets).toEqual(['Why now', 'Goals'])
    expect(validateDocumentData(deckTemplate, data)).toBeNull()
  })

  it('normalizes legacy file json for word/report', () => {
    const data = normalizeRawToDocumentData(
      reportTemplate,
      {
        sections: [{ heading: 'Summary', body: 'Done.' }],
      },
      'Brief',
    )
    expect(data.sections).toHaveLength(1)
    expect(validateDocumentData(reportTemplate, data)).toBeNull()
  })
})

describe('map-to-tool-input', () => {
  const manifest = parseManifestJson(MANIFEST_RAW)

  it('maps sheet data to create_spreadsheet args with theme chart', () => {
    const template = getTemplateById(manifest, 'sales-dashboard')!
    const input = mapToSpreadsheetInput(
      template,
      {
        title: 'Q1',
        sheet: {
          columns: ['Month', 'Revenue'],
          rows: [['Jan', 100]],
        },
      },
      'q1_sales',
    )
    expect(input.output_filename).toBe('q1_sales')
    expect(input.add_chart).toBe(true)
    expect(input.chart_column).toBe('Revenue')
    expect(input.header_color).toBe('2E75B6')
  })

  it('maps slides to create_presentation args with navy theme', () => {
    const template = getTemplateById(manifest, 'navy-roadmap-deck')!
    const input = mapToPresentationInput(
      template,
      {
        title: 'Roadmap',
        meta: { presenter: 'Jane' },
        slides: [{ title: 'Intro', bullets: ['A'] }],
      },
      'roadmap',
    )
    expect(input.theme).toBe('navy')
    expect(input.presentation_title).toBe('Roadmap')
    expect((input.ppt_theme as { bg: string }).bg).toBe('1F397B')
  })

  it('maps sections to create_word_doc args', () => {
    const template = getTemplateById(manifest, 'formal-brief')!
    const input = mapToWordDocInput(
      template,
      {
        title: 'Brief',
        sections: [{ heading: 'Intro', body: 'Text' }],
      },
      'brief',
    )
    expect(input.style).toBe('formal')
    expect(input.sections).toHaveLength(1)
  })
})

describe('HTML mustache template', () => {
  it('renders corporate report with sections', () => {
    const html = Mustache.render(HTML_TEMPLATE, {
      title: 'Q1 Report',
      meta: { author: 'Jane', date: '2026-05-30' },
      sections: [{ heading: 'Summary', body: 'Revenue grew.' }],
    })
    expect(html).toContain('Q1 Report')
    expect(html).toContain('Summary')
    expect(html).toContain('Revenue grew.')
  })
})
