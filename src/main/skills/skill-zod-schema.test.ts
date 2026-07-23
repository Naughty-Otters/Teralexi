import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  convertZodSchemaToJsonSchema,
  serializeToolInputSchema,
} from './skill-zod-schema'

describe('serializeToolInputSchema', () => {
  it('returns undefined for missing schema', () => {
    expect(serializeToolInputSchema(undefined)).toBeUndefined()
  })

  it('passes through plain JSON Schema objects', () => {
    const schema = {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    }
    expect(serializeToolInputSchema(schema)).toEqual(schema)
  })

  it('uses zod v4 toJSONSchema when available', () => {
    const out = serializeToolInputSchema(z.object({ x: z.number() })) as {
      type?: string
    }
    expect(out).toEqual(expect.objectContaining({ type: 'object' }))
  })

  it('flattens discriminatedUnion oneOf into type:object for LLM providers', () => {
    const schema = z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('a'), x: z.string() }),
      z.object({ mode: z.literal('b'), y: z.number() }),
    ])
    const out = serializeToolInputSchema(schema) as {
      type?: string
      properties?: Record<string, unknown>
      required?: string[]
      oneOf?: unknown
      anyOf?: unknown
    }
    expect(out.type).toBe('object')
    expect(out.oneOf).toBeUndefined()
    expect(out.anyOf).toBeUndefined()
    expect(out.properties).toHaveProperty('mode')
    expect(out.properties).toHaveProperty('x')
    expect(out.properties).toHaveProperty('y')
    expect(out.required).toEqual(['mode'])
  })

  it('keeps edit_files schema as a root object', async () => {
    const { editFiles } = await import('../../../toolSet/file-system/edit-files')
    const out = serializeToolInputSchema(editFiles.inputSchema as never) as {
      type?: string
      properties?: Record<string, unknown>
      required?: string[]
    }
    expect(out.type).toBe('object')
    expect(out.properties?.mode).toBeTruthy()
    expect(out.required).toContain('mode')
  })
})

function legacyZod(
  typeName: string,
  extra: Record<string, unknown> = {},
): import('zod').ZodTypeAny {
  return { _def: { typeName, ...extra } } as never
}

describe('convertZodSchemaToJsonSchema', () => {
  it('returns undefined for zod v4 primitives (legacy typeName path)', () => {
    expect(convertZodSchemaToJsonSchema(z.string())).toBeUndefined()
  })

  it('returns undefined when schema def is missing', () => {
    expect(convertZodSchemaToJsonSchema({} as never)).toBeUndefined()
  })

  it('converts legacy ZodObject with required fields', () => {
    const inner = legacyZod('ZodString')
    Object.assign(inner, { isOptional: () => false, isNullable: () => false })
    const optional = legacyZod('ZodString')
    Object.assign(optional, { isOptional: () => true, isNullable: () => false })
    const schema = legacyZod('ZodObject', {
      shape: { name: inner, tag: optional },
    })
    expect(convertZodSchemaToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        tag: { type: 'string' },
      },
      additionalProperties: false,
      required: ['name'],
    })
  })

  it('converts common legacy scalar and container types', () => {
    expect(convertZodSchemaToJsonSchema(legacyZod('ZodNumber'))).toEqual({
      type: 'number',
    })
    expect(convertZodSchemaToJsonSchema(legacyZod('ZodBoolean'))).toEqual({
      type: 'boolean',
    })
    expect(
      convertZodSchemaToJsonSchema(
        legacyZod('ZodArray', { type: legacyZod('ZodString') }),
      ),
    ).toEqual({ type: 'array', items: { type: 'string' } })
    expect(
      convertZodSchemaToJsonSchema(
        legacyZod('ZodEnum', { values: ['a', 'b'] }),
      ),
    ).toEqual({ type: 'string', enum: ['a', 'b'] })
    expect(
      convertZodSchemaToJsonSchema(legacyZod('ZodLiteral', { value: 42 })),
    ).toEqual({ const: 42, type: 'number' })
    expect(convertZodSchemaToJsonSchema(legacyZod('ZodAny'))).toEqual({})
  })

  it('unwraps optional, default, and nullable wrappers', () => {
    const inner = legacyZod('ZodString')
    expect(
      convertZodSchemaToJsonSchema(
        legacyZod('ZodOptional', { innerType: inner }),
      ),
    ).toEqual({ type: 'string' })
    expect(
      convertZodSchemaToJsonSchema(
        legacyZod('ZodNullable', { innerType: inner }),
      ),
    ).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] })
  })
})
