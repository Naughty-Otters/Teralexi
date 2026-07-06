import fs from 'fs'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  MANIFEST_RAW,
  HTML_TEMPLATE,
  EXCEL_THEMES_RAW,
  PPT_THEMES_RAW,
  DATA_JSON,
} = vi.hoisted(() => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const { resolve } = require('node:path') as typeof import('node:path')
  const root = resolve(__dirname, '..')
  return {
    MANIFEST_RAW: readFileSync(resolve(root, 'templates/manifest.json'), 'utf-8'),
    HTML_TEMPLATE: readFileSync(
      resolve(root, 'templates/html/corporate-report.html'),
      'utf-8',
    ),
    EXCEL_THEMES_RAW: readFileSync(
      resolve(root, 'templates/styles/excel-themes.json'),
      'utf-8',
    ),
    PPT_THEMES_RAW: readFileSync(
      resolve(root, 'templates/styles/ppt-themes.json'),
      'utf-8',
    ),
    DATA_JSON: JSON.stringify({
      title: 'Test',
      sheet: { columns: ['A'], rows: [[1]] },
      slides: [{ title: 'S1', bullets: ['b'] }],
      sections: [{ heading: 'H', body: 'B' }],
    }),
  }
})

const mockSpreadsheetExecute = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    filename: 'out.xlsx',
    message: 'Spreadsheet created',
  })),
)
const mockPresentationExecute = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    filename: 'out.pptx',
    message: 'Presentation created',
  })),
)
const mockWordExecute = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    filename: 'out.docx',
    message: 'Word doc created',
  })),
)
const mockExportPdf = vi.hoisted(() => vi.fn(async () => undefined))

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
      if (relPath === 'templates/html/corporate-report.html') {
        return {
          content: HTML_TEMPLATE,
          encoding: 'utf8' as const,
          mimeType: 'text/html',
        }
      }
      if (relPath === 'templates/styles/excel-themes.json') {
        return {
          content: EXCEL_THEMES_RAW,
          encoding: 'utf8' as const,
          mimeType: 'application/json',
        }
      }
      if (relPath === 'templates/styles/ppt-themes.json') {
        return {
          content: PPT_THEMES_RAW,
          encoding: 'utf8' as const,
          mimeType: 'application/json',
        }
      }
      throw new Error(`Unexpected attachment: ${relPath}`)
    }),
    exportHtmlFileToPdf: (...args: unknown[]) => mockExportPdf(...args),
  }
})

vi.mock('./create-spreadsheet', () => ({
  createSpreadsheet: { execute: (...args: unknown[]) => mockSpreadsheetExecute(...args) },
}))
vi.mock('./create-presentation', () => ({
  createPresentation: { execute: (...args: unknown[]) => mockPresentationExecute(...args) },
}))
vi.mock('./create-word-doc', () => ({
  createWordDoc: { execute: (...args: unknown[]) => mockWordExecute(...args) },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => DATA_JSON),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => DATA_JSON),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
})

describe('render_document', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(DATA_JSON)
    vi.resetModules()
  })

  it('routes excel template to create_spreadsheet', async () => {
    const { renderDocument } = await import('./render-document')
    const result = await renderDocument.execute({
      template_id: 'sales-dashboard',
      output_filename: 'sales',
    })
    expect(result).toMatchObject({ success: true })
    expect(mockSpreadsheetExecute).toHaveBeenCalledOnce()
    expect(mockPresentationExecute).not.toHaveBeenCalled()
  })

  it('routes powerpoint template to create_presentation', async () => {
    const { renderDocument } = await import('./render-document')
    await renderDocument.execute({
      template_id: 'navy-roadmap-deck',
      output_filename: 'deck',
    })
    expect(mockPresentationExecute).toHaveBeenCalledOnce()
    expect(mockSpreadsheetExecute).not.toHaveBeenCalled()
  })

  it('routes word template to create_word_doc', async () => {
    const { renderDocument } = await import('./render-document')
    await renderDocument.execute({
      template_id: 'formal-brief',
      output_filename: 'brief',
    })
    expect(mockWordExecute).toHaveBeenCalledOnce()
  })

  it('routes pdf template through html and exportHtmlFileToPdf', async () => {
    const { renderDocument } = await import('./render-document')
    const result = await renderDocument.execute({
      template_id: 'corporate-report-pdf',
      output_filename: 'report',
    })
    expect(mockExportPdf).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ success: true, format: 'pdf' })
  })

  it('returns error for unknown template_id', async () => {
    const { renderDocument } = await import('./render-document')
    const result = await renderDocument.execute({
      template_id: 'nonexistent',
      output_filename: 'x',
    })
    expect(result).toMatchObject({ error: expect.stringContaining('Unknown template_id') })
  })
})
