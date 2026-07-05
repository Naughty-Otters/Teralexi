export type SkillSystemPropertyFieldType = 'string' | 'secret'

export interface SkillSystemPropertySpec {
  key: string
  label: string
  type: SkillSystemPropertyFieldType
  description?: string
  placeholder?: string
}

/** @deprecated Use {@link SkillSystemPropertySpec} — kept for field view typing. */
export type SkillSystemPropertyDef = Omit<SkillSystemPropertySpec, 'key'>

/** Matches config/system-prop-keys — kept local so renderer can import this module. */
function isValidSystemPropKey(key: string): boolean {
  return /^\w+(\.\w+)+$/.test(key)
}

const SYSTEM_PROPERTY_META_LINE =
  /^system_property\.(.+)\.(label|description|type|placeholder):\s*(.*)$/i

function readPropertiesMdScalar(
  raw: string,
  name: string,
): string | undefined {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const match = re.exec(raw)
  return match?.[1]?.trim()
}

function normalizePropertyFieldType(
  raw: string | undefined,
  key: string,
): SkillSystemPropertyFieldType {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === 'secret') return 'secret'
  if (normalized === 'string') return 'string'
  return inferSkillSystemPropertyDef(key).type
}

export function parseSkillSystemPropertyKeys(
  raw: string | undefined,
): string[] {
  if (!raw?.trim()) return []
  const keys: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const key = part.trim()
    if (!key || seen.has(key)) continue
    if (!isValidSystemPropKey(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

/** Fallback labels when a skill omits metadata lines in properties.md. */
export function inferSkillSystemPropertyDef(
  key: string,
): SkillSystemPropertyDef {
  const segment = key.split('.').pop() ?? key
  const label = segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const secret =
    /secret|token|password|apikey/i.test(key) ||
    /secret|token|password/i.test(segment)
  return {
    label,
    type: secret ? 'secret' : 'string',
  }
}

/**
 * Parse `system_properties` plus optional metadata lines from properties.md:
 *
 * ```markdown
 * system_properties: app.google.clientId, app.google.clientSecret
 * system_property.app.google.clientId.label: Google OAuth client ID
 * system_property.app.google.clientId.type: string
 * ```
 */
export function parseSkillSystemPropertySpecs(
  propertiesRaw: string,
): SkillSystemPropertySpec[] {
  const normalized = propertiesRaw.replace(/\r\n/g, '\n')
  const keys = parseSkillSystemPropertyKeys(
    readPropertiesMdScalar(normalized, 'system_properties'),
  )
  if (keys.length === 0) return []

  const metaByKey = new Map<string, Partial<SkillSystemPropertySpec>>()
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = SYSTEM_PROPERTY_META_LINE.exec(trimmed)
    if (!match) continue
    const [, configKey, field, value] = match
    if (!isValidSystemPropKey(configKey)) continue
    const entry = metaByKey.get(configKey) ?? { key: configKey }
    switch (field.toLowerCase()) {
      case 'label':
        entry.label = value.trim()
        break
      case 'description':
        entry.description = value.trim()
        break
      case 'type':
        entry.type = normalizePropertyFieldType(value, configKey)
        break
      case 'placeholder':
        entry.placeholder = value.trim()
        break
    }
    metaByKey.set(configKey, entry)
  }

  return keys.map((key) => {
    const meta = metaByKey.get(key)
    const fallback = inferSkillSystemPropertyDef(key)
    return {
      key,
      label: meta?.label?.trim() || fallback.label,
      type: meta?.type ?? normalizePropertyFieldType(undefined, key),
      ...(meta?.description?.trim()
        ? { description: meta.description.trim() }
        : {}),
      ...(meta?.placeholder?.trim()
        ? { placeholder: meta.placeholder.trim() }
        : {}),
    }
  })
}

export function skillSystemPropertyKeys(
  specs: readonly SkillSystemPropertySpec[],
): string[] {
  return specs.map((spec) => spec.key)
}

export function resolveSkillSystemPropertySpec(
  key: string,
  specs: readonly SkillSystemPropertySpec[] | undefined,
): SkillSystemPropertySpec {
  const hit = specs?.find((spec) => spec.key === key)
  if (hit) return hit
  return { key, ...inferSkillSystemPropertyDef(key) }
}

/** @deprecated Use {@link resolveSkillSystemPropertySpec}. */
export function resolveSkillSystemPropertyDef(
  key: string,
): SkillSystemPropertyDef {
  return inferSkillSystemPropertyDef(key)
}

export function skillSystemPropertyValuesFromMap(
  keys: readonly string[],
  values: Record<string, string>,
): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const key of keys) {
    picked[key] = (values[key] ?? '').trim()
  }
  return picked
}

/** Keys declared by the skill that are still empty in config.properties. */
export function listMissingSkillSystemProperties(
  keys: readonly string[],
  values: Record<string, string>,
): string[] {
  if (keys.length === 0) return []
  return keys.filter((key) => !(values[key] ?? '').trim())
}

export function skillSystemPropertiesSatisfied(
  keys: readonly string[],
  values: Record<string, string>,
): boolean {
  return listMissingSkillSystemProperties(keys, values).length === 0
}
