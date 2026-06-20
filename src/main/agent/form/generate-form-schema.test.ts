import { describe, expect, it } from 'vitest'
import {
  GENERATED_FORM_DOC_NAME,
  MAX_GENERATED_FORM_FIELDS,
  normalizeGeneratedFormSchema,
  schemaToFormMarkdown,
} from './generate-form-schema'
import { parseFormSchemaFromMarkdown } from './schema'

describe('normalizeGeneratedFormSchema', () => {
  it('dedupes keys and caps field count', () => {
    const fields = Array.from({ length: MAX_GENERATED_FORM_FIELDS + 5 }, (_, i) => ({
      key: i === 3 ? 'dup' : i === 7 ? 'dup' : `field_${i}`,
      label: `Field ${i}`,
      type: 'string' as const,
    }))
    const schema = normalizeGeneratedFormSchema(
      { fields },
      { name: 'Task', description: 'Desc' },
    )
    expect(schema.fields).toHaveLength(MAX_GENERATED_FORM_FIELDS)
    expect(schema.fields.some((f) => f.key === 'dup')).toBe(true)
  })

  it('downgrades select without options to string', () => {
    const schema = normalizeGeneratedFormSchema(
      {
        fields: [
          {
            key: 'choice',
            label: 'Choice',
            type: 'select',
            options: [],
          },
        ],
      },
      { name: 'Task', description: 'Desc' },
    )
    expect(schema.fields[0]?.type).toBe('string')
  })

  it('drops system/execution fields from LLM output', () => {
    const schema = normalizeGeneratedFormSchema(
      {
        fields: [
          { key: 'doc_type', label: 'Document type', type: 'select' },
          {
            key: 'success_criteria',
            label: 'How to verify this step',
            type: 'text',
          },
          { key: 'execution_mode', label: 'Execution decision', type: 'string' },
        ],
      },
      { name: 'Task', description: 'Verify output and run tools' },
    )
    expect(schema.fields.map((f) => f.key)).toEqual(['doc_type'])
  })

  it('falls back to user_input when no valid fields', () => {
    const schema = normalizeGeneratedFormSchema(
      { fields: [{ key: 'bad key', label: '', type: 'string' }] },
      { name: 'My task', description: 'Do something' },
    )
    expect(schema.fields).toHaveLength(1)
    expect(schema.fields[0]?.key).toBe('user_input')
    expect(schema.title).toBe('My task')
  })
})

describe('schemaToFormMarkdown', () => {
  it('round-trips through parseFormSchemaFromMarkdown', () => {
    const original = normalizeGeneratedFormSchema(
      {
        title: 'Title',
        message: 'Message',
        fields: [
          {
            key: 'name',
            label: 'Name',
            type: 'string',
            required: true,
          },
        ],
      },
      { name: 'T', description: 'D' },
    )
    const markdown = schemaToFormMarkdown(original)
    expect(markdown).toContain('FORM_SCHEMA')
    const parsed = parseFormSchemaFromMarkdown(markdown)
    expect(parsed?.title).toBe('Title')
    expect(parsed?.fields[0]?.key).toBe('name')
  })
})

describe('GENERATED_FORM_DOC_NAME', () => {
  it('is stable for UI and collect step', () => {
    expect(GENERATED_FORM_DOC_NAME).toBe('generated.form.md')
  })
})
