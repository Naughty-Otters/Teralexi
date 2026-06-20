type ZodSchema = import('zod').ZodTypeAny

function unwrapZodType(schema: ZodSchema): ZodSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def
  const typeKey: string = def?.type ?? def?.typeName ?? ''

  switch (typeKey) {
    case 'optional':
    case 'ZodOptional':
    case 'default':
    case 'ZodDefault':
    case 'nullable':
    case 'ZodNullable':
      return unwrapZodType(def.innerType)
    case 'ZodEffects':
      return unwrapZodType(def.schema)
    default:
      return schema
  }
}

export function zodTypeLabel(schema: ZodSchema): string {
  const base = unwrapZodType(schema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (base as any)._def
  const t: string = def?.type ?? def?.typeName ?? ''

  switch (t) {
    case 'string':
    case 'ZodString':
      return 'string'
    case 'number':
    case 'ZodNumber':
      return 'number'
    case 'boolean':
    case 'ZodBoolean':
      return 'boolean'
    case 'array':
    case 'ZodArray':
      return 'array'
    case 'object':
    case 'ZodObject':
      return 'object'
    case 'record':
    case 'ZodRecord':
      return 'record'
    case 'enum':
    case 'ZodEnum': {
      const values = (
        def.entries ? Object.keys(def.entries) : (def.values ?? [])
      ) as string[]
      return `enum(${values.join(' | ')})`
    }
    default:
      return t.replace('Zod', '').toLowerCase() || 'unknown'
  }
}

export function extractZodParams(schema: ZodSchema | undefined): Array<{
  name: string
  type: string
  required: boolean
  description?: string
  default?: string
}> {
  if (!schema) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = schema
  while (s._def?.typeName === 'ZodEffects') {
    s = s._def.schema
  }
  const defType: string = s._def?.type ?? s._def?.typeName ?? ''
  if (defType !== 'object' && defType !== 'ZodObject') return []

  const shape: Record<string, ZodSchema> =
    s.shape ?? s._def?.shape?.() ?? {}

  return Object.entries(shape).map(([name, field]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (field as any)._def
    const fieldType: string = def?.type ?? def?.typeName ?? ''

    let defaultValue: string | undefined
    if (fieldType === 'default' || fieldType === 'ZodDefault') {
      const raw = def.defaultValue
      defaultValue = String(typeof raw === 'function' ? raw() : raw)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const required = !(field as any).isOptional()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const description: string | undefined =
      (field as any).description ?? undefined
    return {
      name,
      type: zodTypeLabel(field),
      required,
      description,
      default: defaultValue,
    }
  })
}
