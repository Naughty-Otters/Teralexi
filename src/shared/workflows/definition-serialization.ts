import { jsonrepair } from 'jsonrepair'
import { z } from 'zod'
import { normalizeWorkflowDefinitionRaw } from './normalize-workflow-definition'
import {
  safeParseWorkflowDefinition,
  workflowBusinessEntitySchema,
  workflowDefinitionSchema,
  workflowEntityFieldSchema,
  type WorkflowBusinessEntity,
  type WorkflowDefinition,
  type WorkflowEntityField,
} from './schema'

const WORKFLOW_DEFINITION_JSON_FILENAME = 'workflow_definition.json'
const ENTITIES_DEFINITION_JSON_FILENAME = 'entities_definition.json'

export const workflowEntitiesSchema = z.array(workflowBusinessEntitySchema)

export type WorkflowDefinitionBody = Omit<WorkflowDefinition, 'entities'>

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] }

function parseJsonText(json: string): ParseResult<unknown> {
  const trimmed = json.trim()
  if (!trimmed) {
    return { success: false, errors: ['JSON input is empty'] }
  }
  try {
    return { success: true, data: JSON.parse(jsonrepair(trimmed)) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON'
    return { success: false, errors: [message] }
  }
}

export function formatZodIssues(
  error: z.ZodError,
  prefix: string,
): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${prefix}: ${path}: ${issue.message}`
  })
}

function stripEntities(definition: WorkflowDefinition): WorkflowDefinitionBody {
  const { entities: _entities, ...body } = definition
  return body
}

/** Deserialize workflow_definition.json (no entities). */
export function safeParseWorkflowDefinitionBodyJson(
  json: string,
): ParseResult<WorkflowDefinitionBody> {
  const parsedJson = parseJsonText(json)
  if (!parsedJson.success) {
    return {
      success: false,
      errors: parsedJson.errors.map((e) => `${WORKFLOW_DEFINITION_JSON_FILENAME}: ${e}`),
    }
  }

  const normalized = normalizeWorkflowDefinitionRaw(parsedJson.data)
  const parsed = safeParseWorkflowDefinition(normalized)
  if (!parsed.success) {
    return {
      success: false,
      errors: [`${WORKFLOW_DEFINITION_JSON_FILENAME}: ${parsed.error}`],
    }
  }

  return { success: true, data: stripEntities(parsed.data) }
}

export function parseWorkflowDefinitionBodyJson(json: string): WorkflowDefinitionBody {
  const parsed = safeParseWorkflowDefinitionBodyJson(json)
  if (!parsed.success) throw new Error(parsed.errors.join('; '))
  return parsed.data
}

/** Serialize workflow body (entities omitted) through Zod. */
export function serializeWorkflowDefinitionBody(definition: WorkflowDefinitionBody): string {
  const full = workflowDefinitionSchema.parse({ ...definition, entities: undefined })
  return `${JSON.stringify(stripEntities(full), null, 2)}\n`
}

export function serializeWorkflowDefinitionBodyFromUnknown(raw: unknown): string {
  const normalized = normalizeWorkflowDefinitionRaw(raw)
  const parsed = workflowDefinitionSchema.parse(normalized)
  return serializeWorkflowDefinitionBody(stripEntities(parsed))
}

/** Deserialize entities_definition.json (entity array). */
export function safeParseEntitiesDefinitionJson(
  json: string,
): ParseResult<WorkflowBusinessEntity[]> {
  const parsedJson = parseJsonText(json)
  if (!parsedJson.success) {
    return {
      success: false,
      errors: parsedJson.errors.map((e) => `${ENTITIES_DEFINITION_JSON_FILENAME}: ${e}`),
    }
  }
  return safeParseWorkflowEntities(parsedJson.data)
}

export function parseEntitiesDefinitionJson(json: string): WorkflowBusinessEntity[] {
  const parsed = safeParseEntitiesDefinitionJson(json)
  if (!parsed.success) throw new Error(parsed.errors.join('; '))
  return parsed.data
}

export function serializeEntitiesDefinition(entities: WorkflowBusinessEntity[]): string {
  return serializeWorkflowEntities(entities)
}

export function serializeEntitiesDefinitionFromUnknown(raw: unknown): string {
  return serializeWorkflowEntities(parseWorkflowEntities(raw))
}

/** Merge workflow + entities source files into a full WorkflowDefinition. */
export function mergeWorkflowDefinition(
  body: WorkflowDefinitionBody,
  entities: WorkflowBusinessEntity[],
): WorkflowDefinition {
  return workflowDefinitionSchema.parse({
    ...body,
    entities: entities.length > 0 ? entities : undefined,
  })
}

export function mergeWorkflowSourceJson(
  workflowDefinitionJson: string,
  entitiesDefinitionJson: string,
): ParseResult<WorkflowDefinition> {
  const body = safeParseWorkflowDefinitionBodyJson(workflowDefinitionJson)
  if (!body.success) return body

  const entitiesText = entitiesDefinitionJson.trim()
  const entities = entitiesText
    ? safeParseEntitiesDefinitionJson(entitiesDefinitionJson)
    : ({ success: true as const, data: [] as WorkflowBusinessEntity[] })

  if (!entities.success) return entities

  try {
    return {
      success: true,
      data: mergeWorkflowDefinition(body.data, entities.data),
    }
  } catch (err) {
    return {
      success: false,
      errors: [
        err instanceof Error ? err.message : 'Failed to merge workflow sources',
      ],
    }
  }
}

/** Deserialize legacy/full definition JSON. */
export function safeParseWorkflowDefinitionJson(
  json: string,
): ParseResult<WorkflowDefinition> {
  const parsedJson = parseJsonText(json)
  if (!parsedJson.success) {
    return {
      success: false,
      errors: parsedJson.errors.map((e) => `definition.json: ${e}`),
    }
  }
  const normalized = normalizeWorkflowDefinitionRaw(parsedJson.data)
  const parsed = safeParseWorkflowDefinition(normalized)
  if (!parsed.success) {
    return { success: false, errors: [`definition.json: ${parsed.error}`] }
  }
  return { success: true, data: parsed.data }
}

export function parseWorkflowDefinitionJson(json: string): WorkflowDefinition {
  const parsed = safeParseWorkflowDefinitionJson(json)
  if (!parsed.success) throw new Error(parsed.errors.join('; '))
  return parsed.data
}

export function serializeWorkflowDefinition(definition: WorkflowDefinition): string {
  return `${JSON.stringify(workflowDefinitionSchema.parse(definition), null, 2)}\n`
}

export function serializeWorkflowDefinitionFromUnknown(raw: unknown): string {
  const normalized = normalizeWorkflowDefinitionRaw(raw)
  return serializeWorkflowDefinition(workflowDefinitionSchema.parse(normalized))
}

export function safeParseWorkflowEntities(raw: unknown): ParseResult<WorkflowBusinessEntity[]> {
  const result = workflowEntitiesSchema.safeParse(raw)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: formatZodIssues(result.error, ENTITIES_DEFINITION_JSON_FILENAME),
  }
}

export function parseWorkflowEntities(raw: unknown): WorkflowBusinessEntity[] {
  const parsed = safeParseWorkflowEntities(raw)
  if (!parsed.success) throw new Error(parsed.errors.join('; '))
  return parsed.data
}

export function serializeWorkflowEntities(entities: WorkflowBusinessEntity[]): string {
  return `${JSON.stringify(workflowEntitiesSchema.parse(entities), null, 2)}\n`
}

export function parseWorkflowEntityField(raw: unknown): WorkflowEntityField {
  return workflowEntityFieldSchema.parse(raw)
}
