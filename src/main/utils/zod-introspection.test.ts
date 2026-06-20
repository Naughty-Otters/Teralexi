import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractZodParams, zodTypeLabel } from './zod-introspection'

describe('zodTypeLabel', () => {
  it('labels primitives and collections', () => {
    expect(zodTypeLabel(z.string())).toBe('string')
    expect(zodTypeLabel(z.number())).toBe('number')
    expect(zodTypeLabel(z.boolean())).toBe('boolean')
    expect(zodTypeLabel(z.array(z.string()))).toBe('array')
    expect(zodTypeLabel(z.object({ a: z.string() }))).toBe('object')
  })

  it('unwraps optional and default wrappers', () => {
    expect(zodTypeLabel(z.string().optional())).toBe('string')
    expect(zodTypeLabel(z.string().default('x'))).toBe('string')
  })

  it('formats enum types', () => {
    const label = zodTypeLabel(z.enum(['a', 'b']))
    expect(label).toContain('enum')
    expect(label).toContain('a')
    expect(label).toContain('b')
  })

  it('labels record and unknown types', () => {
    expect(zodTypeLabel(z.record(z.string(), z.number()))).toBe('record')
    expect(zodTypeLabel(z.unknown())).toBe('unknown')
  })

  it('unwraps nullable wrappers', () => {
    expect(zodTypeLabel(z.string().nullable())).toBe('string')
  })
})

describe('extractZodParams', () => {
  it('returns empty for undefined or non-object schemas', () => {
    expect(extractZodParams(undefined)).toEqual([])
    expect(extractZodParams(z.string())).toEqual([])
  })

  it('extracts object field metadata', () => {
    const schema = z.object({
      name: z.string().describe('Display name'),
      count: z.number().optional(),
      flag: z.boolean().default(true),
    })
    const params = extractZodParams(schema)
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'string', required: true }),
        expect.objectContaining({ name: 'count', required: false }),
        expect.objectContaining({ name: 'flag', default: 'true' }),
      ]),
    )
  })
})
