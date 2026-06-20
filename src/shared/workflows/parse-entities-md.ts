import type {
  WorkflowBusinessEntity,
  WorkflowEntityField,
  WorkflowEntityFieldSource,
} from './schema'

export type EntitiesMdParseResult = {
  entities: WorkflowBusinessEntity[]
  errors: string[]
}

function parseBool(value: string | undefined): boolean | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (['yes', 'true', 'required', '1'].includes(normalized)) return true
  if (['no', 'false', 'optional', '0'].includes(normalized)) return false
  return undefined
}

function parseFieldSource(
  raw: string,
  fieldKey: string,
  errors: string[],
): WorkflowEntityFieldSource | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    errors.push(`Field "${fieldKey}": missing source column`)
    return null
  }

  if (trimmed.startsWith('user_input:')) {
    const rest = trimmed.slice('user_input:'.length).trim()
    const [formStepId, inputKey] = rest.split('/')
    return {
      kind: 'user_input',
      formStepId: formStepId?.trim() || undefined,
      inputKey: inputKey?.trim() || fieldKey,
    }
  }

  if (trimmed.startsWith('tool:')) {
    const rest = trimmed.slice('tool:'.length).trim()
    const [toolPart, resultPath] = rest.split('/')
    const [tool, stepId] = (toolPart ?? '').split('@')
    if (!tool?.trim()) {
      errors.push(`Field "${fieldKey}": tool source requires tool name (tool: name@step)`)
      return null
    }
    return {
      kind: 'tool',
      tool: tool.trim(),
      stepId: stepId?.trim() || undefined,
      resultPath: resultPath?.trim() || undefined,
    }
  }

  errors.push(
    `Field "${fieldKey}": invalid source "${trimmed}" (use user_input: stepId or tool: tool@stepId)`,
  )
  return null
}

function splitEntitySectionBody(body: string): {
  description?: string
  tableBody: string
} {
  const lines = body.split('\n')
  const tableLineIndex = lines.findIndex((line) => line.trim().startsWith('|'))
  if (tableLineIndex < 0) {
    return { description: body.trim() || undefined, tableBody: '' }
  }
  const description = lines.slice(0, tableLineIndex).join('\n').trim()
  return {
    description: description || undefined,
    tableBody: lines.slice(tableLineIndex).join('\n'),
  }
}

function parseEntityTable(
  entityId: string,
  entityName: string,
  description: string | undefined,
  tableBody: string,
  errors: string[],
): WorkflowBusinessEntity | null {
  const lines = tableBody
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !l.includes('---'))

  if (lines.length === 0) {
    errors.push(`Entity "${entityId}": missing field table`)
    return null
  }

  const header = lines[0]!
    .split('|')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)

  const col = (name: string) => header.indexOf(name)
  const keyCol = col('key')
  const labelCol = col('label')
  const typeCol = col('type')
  const requiredCol = col('required')
  const sourceCol = col('source')

  if (keyCol < 0 || typeCol < 0 || sourceCol < 0) {
    errors.push(
      `Entity "${entityId}": table must include key, type, and source columns`,
    )
    return null
  }

  const fields: WorkflowEntityField[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    const key = cells[keyCol]
    if (!key) continue

    const typeRaw = cells[typeCol]?.toLowerCase()
    const validTypes = [
      'string',
      'text',
      'number',
      'boolean',
      'date',
      'datetime',
      'email',
      'select',
      'reference',
    ] as const
    if (!typeRaw || !validTypes.includes(typeRaw as (typeof validTypes)[number])) {
      errors.push(`Entity "${entityId}" field "${key}": invalid type "${cells[typeCol] ?? ''}"`)
      continue
    }

    const source = parseFieldSource(cells[sourceCol] ?? '', key, errors)
    if (!source) continue

    fields.push({
      key,
      label: labelCol >= 0 ? cells[labelCol] || undefined : undefined,
      type: typeRaw as WorkflowEntityField['type'],
      required: requiredCol >= 0 ? parseBool(cells[requiredCol]) : undefined,
      source,
    })
  }

  if (fields.length === 0) {
    errors.push(`Entity "${entityId}": no valid fields parsed`)
    return null
  }

  return {
    id: entityId,
    name: entityName,
    description,
    fields,
  }
}

/** Parse entities.md into business entity definitions for forms and runtime. */
export function parseEntitiesMd(markdown: string): EntitiesMdParseResult {
  const errors: string[] = []
  const entities: WorkflowBusinessEntity[] = []

  const sections = [
    ...markdown.matchAll(
      /##\s+(\S+)\s+\(([^)]+)\)\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/g,
    ),
  ]

  if (sections.length === 0) {
    if (markdown.trim()) {
      errors.push('entities.md: no entities found (use ## entity_id (Display Name) headings)')
    }
    return { entities, errors }
  }

  for (const match of sections) {
    const entityId = match[1]!.trim()
    const entityName = match[2]!.trim()
    const body = match[3] ?? ''

    const { description, tableBody } = splitEntitySectionBody(body)

    const entity = parseEntityTable(
      entityId,
      entityName,
      description,
      tableBody,
      errors,
    )
    if (entity) entities.push(entity)
  }

  return { entities, errors }
}
