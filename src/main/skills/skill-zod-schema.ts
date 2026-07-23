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

/**
 * LLM providers require tool parameter schemas to be `type: "object"`.
 * Zod discriminated unions serialize as root `oneOf`/`anyOf` (type undefined/null)
 * and get rejected — merge object variants into a single flat object schema.
 */
export function ensureToolParametersObjectSchema(
  schema: unknown,
): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema
  }
  const root = schema as Record<string, unknown>
  if (root.type === 'object') return schema

  const variants = (root.oneOf ?? root.anyOf) as unknown
  if (!Array.isArray(variants) || variants.length === 0) return schema

  const objects = variants.filter(
    (v): v is Record<string, unknown> =>
      !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      (v.type === 'object' ||
        (v.properties != null && typeof v.properties === 'object')),
  )
  if (objects.length !== variants.length) return schema

  const properties: Record<string, unknown> = {}
  let requiredIntersection: Set<string> | null = null

  for (const variant of objects) {
    const props = (variant.properties ?? {}) as Record<string, unknown>
    for (const [key, prop] of Object.entries(props)) {
      properties[key] = mergeJsonSchemaProperties(properties[key], prop)
    }
    const req = new Set(
      Array.isArray(variant.required)
        ? variant.required.filter((k): k is string => typeof k === 'string')
        : [],
    )
    requiredIntersection =
      requiredIntersection == null
        ? req
        : new Set([...requiredIntersection].filter((k) => req.has(k)))
  }

  const required = [...(requiredIntersection ?? [])]
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
  }
}

function mergeJsonSchemaProperties(
  existing: unknown,
  incoming: unknown,
): unknown {
  if (existing == null) return incoming
  if (incoming == null) return existing
  if (typeof existing !== 'object' || typeof incoming !== 'object') {
    return existing
  }
  const a = existing as Record<string, unknown>
  const b = incoming as Record<string, unknown>

  const aConsts = collectStringConsts(a)
  const bConsts = collectStringConsts(b)
  if (aConsts.length > 0 && bConsts.length > 0) {
    const values = [...new Set([...aConsts, ...bConsts])]
    return { type: 'string', enum: values }
  }

  // Prefer a schema that already has a concrete type.
  if (a.type && !b.type) return a
  if (b.type && !a.type) return b
  return a
}

function collectStringConsts(schema: Record<string, unknown>): string[] {
  if (typeof schema.const === 'string') return [schema.const]
  if (Array.isArray(schema.enum)) {
    return schema.enum.filter((v): v is string => typeof v === 'string')
  }
  return []
}

export function serializeToolInputSchema(
  schema: import('zod').ZodTypeAny | Record<string, unknown> | undefined,
): unknown {
  if (!schema) return undefined
  if (isPlainJsonSchema(schema)) {
    return ensureToolParametersObjectSchema(schema)
  }

  const anySchema = schema as unknown as {
    toJSON?: () => unknown
    toJSONSchema?: () => unknown
  }
  let converted: unknown
  if (typeof anySchema.toJSON === 'function') converted = anySchema.toJSON()
  else if (typeof anySchema.toJSONSchema === 'function')
    converted = anySchema.toJSONSchema()
  else if (typeof (z as any).toJSONSchema === 'function')
    converted = (z as any).toJSONSchema(schema)
  else converted = convertZodSchemaToJsonSchema(schema)

  return ensureToolParametersObjectSchema(converted)
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
