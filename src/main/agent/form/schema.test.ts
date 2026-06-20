import { describe, expect, it } from 'vitest'
import {
  formValuesSatisfyRequired,
  getSelectOptionValues,
  isAllowedSelectValue,
  normalizeSelectOptions,
  parseFormFieldsFromMarkdown,
  parseFormSchemaFromMarkdown,
  resolveSelectValue,
} from '@main/agent/form'

describe('parseFormFieldsFromMarkdown', () => {
  it('parses fields from HTML comment schema', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"name","label":"Name","type":"string","required":true}]} -->`
    const fields = parseFormFieldsFromMarkdown(md)
    expect(fields).toEqual([
      expect.objectContaining({ key: 'name', label: 'Name', type: 'string', required: true }),
    ])
  })

  it('parses select fields with string options', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"tag","label":"Tag","type":"select","required":true,"options":["life","love","inspirational"]}]} -->`
    const fields = parseFormFieldsFromMarkdown(md)
    expect(fields[0]).toMatchObject({
      key: 'tag',
      type: 'select',
      required: true,
      options: [
        { value: 'life', label: 'life' },
        { value: 'love', label: 'love' },
        { value: 'inspirational', label: 'inspirational' },
      ],
    })
  })

  it('parses select fields with value/label objects and dropdown alias', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"engine","label":"Engine","type":"dropdown","options":[{"value":"ddg","label":"DuckDuckGo"},{"value":"bing","label":"Bing"}]}]} -->`
    expect(parseFormFieldsFromMarkdown(md)[0]).toMatchObject({
      type: 'select',
      options: [
        { value: 'ddg', label: 'DuckDuckGo' },
        { value: 'bing', label: 'Bing' },
      ],
    })
  })

  it('parses select with optionsFrom before resolution', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"tag","label":"Tag","type":"select","optionsFrom":{"artifact":"top-tags-today.md"}}]} -->`
    expect(parseFormFieldsFromMarkdown(md)[0]).toMatchObject({
      type: 'select',
      optionsFrom: { artifact: 'top-tags-today.md' },
    })
  })

  it('parses titleFrom and messageFrom bindings', () => {
    const md = `<!-- FORM_SCHEMA {"titleFrom":{"jsonPath":"$.title"},"messageFrom":{"jsonPath":"$.message"},"fields":[{"key":"x","label":"X","type":"string"}]} -->`
    const schema = parseFormSchemaFromMarkdown(md)
    expect(schema.titleFrom).toEqual({ jsonPath: '$.title' })
    expect(schema.messageFrom).toEqual({ jsonPath: '$.message' })
  })

  it('parses select optionsFrom with jsonPath only', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"tag","label":"Tag","type":"select","optionsFrom":{"jsonPath":"$.options.tag"}}]} -->`
    expect(parseFormFieldsFromMarkdown(md)[0]).toMatchObject({
      type: 'select',
      optionsFrom: { jsonPath: '$.options.tag' },
    })
  })

  it('parses enum alias as select', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"mode","label":"Mode","type":"enum","options":["a","b"]}]} -->`
    expect(parseFormFieldsFromMarkdown(md)[0]).toMatchObject({
      type: 'select',
      options: [
        { value: 'a', label: 'a' },
        { value: 'b', label: 'b' },
      ],
    })
  })

  it('parses static title and projectionArtifact in schema', () => {
    const md = `<!-- FORM_SCHEMA {"title":"Hello","projectionArtifact":"custom.json","fields":[{"key":"x","label":"X","type":"string"}]} -->`
    expect(parseFormSchemaFromMarkdown(md)).toMatchObject({
      title: 'Hello',
      projectionArtifact: 'custom.json',
    })
  })

  it('falls back to string when select has no options or optionsFrom', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"x","label":"X","type":"select"}]} -->`
    expect(parseFormFieldsFromMarkdown(md)[0].type).toBe('string')
  })

  it('parses fields from fenced json block', () => {
    const md = '```json\n{"fields":[{"key":"qty","label":"Qty","type":"number"}]}\n```'
    expect(parseFormFieldsFromMarkdown(md)[0]).toMatchObject({
      key: 'qty',
      type: 'number',
    })
  })

  it('returns default fields when schema missing or invalid', () => {
    expect(parseFormFieldsFromMarkdown('no schema')).toEqual([
      expect.objectContaining({ key: 'notes' }),
    ])
    expect(parseFormFieldsFromMarkdown('<!-- FORM_SCHEMA not-json -->')).toEqual([
      expect.objectContaining({ key: 'notes' }),
    ])
  })

  it('normalizes invalid field types to string', () => {
    const md = `<!-- FORM_SCHEMA {"fields":[{"key":"x","label":"","type":"weird"}]} -->`
    expect(parseFormFieldsFromMarkdown(md)[0].type).toBe('string')
  })
})

describe('getSelectOptionValues', () => {
  it('returns option values in order', () => {
    expect(
      getSelectOptionValues([
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ]),
    ).toEqual(['a', 'b'])
  })
})

describe('normalizeSelectOptions', () => {
  it('dedupes by value', () => {
    expect(normalizeSelectOptions(['a', 'a', 'b'])).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ])
  })
})

describe('resolveSelectValue', () => {
  const field = parseFormFieldsFromMarkdown(
    `<!-- FORM_SCHEMA {"fields":[{"key":"t","label":"T","type":"select","options":[{"value":"life","label":"Life"}]}]} -->`,
  )[0]!

  it('matches value and label case-insensitively', () => {
    expect(resolveSelectValue(field, 'life')).toBe('life')
    expect(resolveSelectValue(field, 'Life')).toBe('life')
    expect(resolveSelectValue(field, 'unknown')).toBeUndefined()
  })
})

describe('formValuesSatisfyRequired', () => {
  const fields = [
    { key: 'title', label: 'Title', type: 'string' as const, required: true },
    { key: 'ok', label: 'OK', type: 'boolean' as const, required: true },
    { key: 'note', label: 'Note', type: 'text' as const, required: false },
  ]

  it('returns true when required fields satisfied', () => {
    expect(
      formValuesSatisfyRequired(fields, { title: 'Hi', ok: true }),
    ).toBe(true)
  })

  it('rejects empty required strings', () => {
    expect(formValuesSatisfyRequired(fields, { title: '  ', ok: true })).toBe(
      false,
    )
  })

  it('requires boolean type for boolean fields', () => {
    expect(
      formValuesSatisfyRequired(fields, { title: 'x', ok: 'yes' }),
    ).toBe(false)
  })

  it('requires select values to match an option', () => {
    const selectFields = parseFormFieldsFromMarkdown(
      `<!-- FORM_SCHEMA {"fields":[{"key":"tag","label":"Tag","type":"select","required":true,"options":["life"]}]} -->`,
    )
    expect(formValuesSatisfyRequired(selectFields, { tag: 'life' })).toBe(true)
    expect(formValuesSatisfyRequired(selectFields, { tag: 'other' })).toBe(
      false,
    )
    expect(formValuesSatisfyRequired(selectFields, {})).toBe(false)
    expect(isAllowedSelectValue(selectFields[0]!, 'life')).toBe(true)
    expect(isAllowedSelectValue(selectFields[0]!, 'other')).toBe(false)
  })

  it('rejects non-matching optional select values when provided', () => {
    const optionalSelect = parseFormFieldsFromMarkdown(
      `<!-- FORM_SCHEMA {"fields":[{"key":"tag","label":"Tag","type":"select","required":false,"options":["life"]}]} -->`,
    )
    expect(formValuesSatisfyRequired(optionalSelect, { tag: 'invalid' })).toBe(
      false,
    )
    expect(formValuesSatisfyRequired(optionalSelect, {})).toBe(true)
  })
})
