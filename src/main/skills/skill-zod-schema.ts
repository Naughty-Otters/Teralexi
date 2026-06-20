import { z } from 'zod'

function isPlainJsonSchema(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if ('_def' in value) return false
  return (
    'type' in value ||
    'properties' in value ||
    '$schema' in value ||
    'anyOf' in value ||
    'oneOf' in value
  )
}

export function serializeToolInputSchema(
  schema: import('zod').ZodTypeAny | Record<string, unknown> | undefined,
): unknown {
  if (!schema) return undefined
  if (isPlainJsonSchema(schema)) return schema

  const anySchema = schema as unknown as {
    toJSON?: () => unknown
    toJSONSchema?: () => unknown
  }
  if (typeof anySchema.toJSON === 'function') return anySchema.toJSON()
  if (typeof anySchema.toJSONSchema === 'function')
    return anySchema.toJSONSchema()
  if (typeof (z as any).toJSONSchema === 'function')
    return (z as any).toJSONSchema(schema)

  return convertZodSchemaToJsonSchema(schema)
}

export function convertZodSchemaToJsonSchema(
  schema: import('zod').ZodTypeAny,
): unknown {
  const def = (schema as any)._def
  if (!def || typeof def.typeName !== 'string') return undefined

  switch (def.typeName) {
    case 'ZodObject': {
      const shape =
        typeof def.shape === 'function' ? def.shape() : (def.shape ?? {})
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const key of Object.keys(shape)) {
        const propertySchema = shape[key]
        properties[key] = convertZodSchemaToJsonSchema(propertySchema) ?? {
          type: 'object',
        }
        if (!propertySchema.isOptional?.() && !propertySchema.isNullable?.()) {
          required.push(key)
        }
      }
      return {
        type: 'object',
        properties,
        additionalProperties: false,
        ...(required.length ? { required } : undefined),
      }
    }
    case 'ZodString':
      return { type: 'string' }
    case 'ZodNumber':
      return { type: 'number' }
    case 'ZodBoolean':
      return { type: 'boolean' }
    case 'ZodArray':
      return {
        type: 'array',
        items: convertZodSchemaToJsonSchema(def.type) ?? {},
      }
    case 'ZodUnion':
      return {
        anyOf: Array.isArray(def.options)
          ? def.options.map(
              (option: any) => convertZodSchemaToJsonSchema(option) ?? {},
            )
          : [],
      }
    case 'ZodLiteral':
      return { const: def.value, type: typeof def.value }
    case 'ZodEnum':
      return { type: 'string', enum: def.values }
    case 'ZodNativeEnum':
      return {
        type: typeof def.values[Object.keys(def.values)[0]],
        enum: Object.values(def.values),
      }
    case 'ZodOptional':
    case 'ZodDefault':
      return convertZodSchemaToJsonSchema(def.innerType ?? def.type)
    case 'ZodNullable': {
      const inner = convertZodSchemaToJsonSchema(def.innerType ?? def.type)
      if (!inner || typeof inner !== 'object') return { type: 'null' }
      return { anyOf: [inner, { type: 'null' }] }
    }
    case 'ZodAny':
    case 'ZodUnknown':
      return {}
    case 'ZodRecord':
      return {
        type: 'object',
        additionalProperties: convertZodSchemaToJsonSchema(def.valueType) ?? {},
      }
    default:
      return {}
  }
}
