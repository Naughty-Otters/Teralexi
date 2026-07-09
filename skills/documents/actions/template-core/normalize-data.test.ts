import { describe, expect, it } from 'vitest'
import {
  normalizeFormToDocumentData,
  normalizeRawToDocumentData,
  validateDocumentData,
} from './normalize-data'
import type { TemplateManifestEntry } from './types'

const wordTemplate: TemplateManifestEntry = {
  id: 'formal-brief',
  label: 'Formal Brief',
  doc_types: ['word'],
  schema: 'word',
  renderer: 'word',
}

const excelTemplate: TemplateManifestEntry = {
  id: 'sales-dashboard',
  label: 'Sales Dashboard',
  doc_types: ['excel'],
  schema: 'excel',
  renderer: 'excel',
}

const deckTemplate: TemplateManifestEntry = {
  id: 'navy-roadmap-deck',
  label: 'Roadmap Deck',
  doc_types: ['powerpoint'],
  schema: 'powerpoint',
  renderer: 'powerpoint',
}

describe('documents normalize-data', () => {
  it('parses section outlines without colons', () => {
    const data = normalizeFormToDocumentData(
      wordTemplate,
      { sections: 'Summary\nNext steps' },
      'Brief',
    )
    expect(data.sections).toEqual([
      { heading: 'Summary', body: '', level: 1 },
      { heading: 'Next steps', body: '', level: 1 },
    ])
  })

  it('parses table data from csv strings when include_table is set', () => {
    const data = normalizeFormToDocumentData(
      wordTemplate,
      {
        sections: 'Overview: Done',
        include_table: true,
        table_data: 'Name, Value\nAlpha, 1',
      },
      'Brief',
    )
    expect(data.table).toEqual({
      headers: ['Name', 'Value'],
      rows: [['Alpha', '1']],
    })
  })

  it('returns canonical raw data unchanged when already normalized', () => {
    const canonical = {
      title: 'Report',
      sections: [{ heading: 'Summary', body: 'Done.' }],
    }
    expect(normalizeRawToDocumentData(wordTemplate, canonical, 'Report')).toBe(
      canonical,
    )
  })

  it('throws when raw data is not an object', () => {
    expect(() =>
      normalizeRawToDocumentData(wordTemplate, null, 'Report'),
    ).toThrow(/must be a JSON object/)
  })

  it('validates required fields per renderer', () => {
    expect(
      validateDocumentData(excelTemplate, {
        title: 'Q1',
        sheet: { columns: [], rows: [] },
      }),
    ).toBe('sheet.columns is required')
    expect(
      validateDocumentData(deckTemplate, { title: 'Deck', slides: [] }),
    ).toBe('slides is required')
    expect(
      validateDocumentData(wordTemplate, { title: 'Brief', sections: [] }),
    ).toBe('sections is required')
  })
})
