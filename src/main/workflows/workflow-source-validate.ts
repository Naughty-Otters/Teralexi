import {
  mergeWorkflowSourceJson,
  safeParseEntitiesDefinitionJson,
  safeParseWorkflowDefinitionBodyJson,
} from '@shared/workflows/definition-serialization'
import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from '@shared/workflows/source-files'
import {
  WORKFLOW_DEFINITION_VERSION,
  type WorkflowDefinition,
} from '@shared/workflows/schema'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { getWorkflowSourceDir } from '@config/openfde-home'
import { validateWorkflowDefinition } from './workflow-validator'

export type WorkflowSourceValidation = {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export type WorkflowSourceValidateContext = {
  workflowId: string
  workflowName: string
  knownTools?: Set<string>
  sourceDir?: string
}

function readSourceFile(
  ctx: WorkflowSourceValidateContext,
  fileName: string,
): string {
  const root = ctx.sourceDir ?? getWorkflowSourceDir(ctx.workflowId)
  try {
    return readFileSync(join(resolve(root), fileName), 'utf-8')
  } catch {
    return ''
  }
}

/** Validate workflow_definition.json (workflow body only). */
export function validateWorkflowDefinitionJsonSource(
  ctx: WorkflowSourceValidateContext,
  workflowDefinitionJson: string,
): WorkflowSourceValidation {
  const parsed = safeParseWorkflowDefinitionBodyJson(workflowDefinitionJson)
  if (!parsed.success) {
    return { valid: false, errors: parsed.errors, warnings: [] }
  }

  const errors: string[] = []
  if (parsed.data.id !== ctx.workflowId) {
    errors.push(
      `${WORKFLOW_DEFINITION_JSON_FILENAME}: id must be "${ctx.workflowId}" (found "${parsed.data.id}")`,
    )
  }

  const entitiesJson = readSourceFile(ctx, ENTITIES_DEFINITION_JSON_FILENAME)
  const merged = mergeWorkflowSourceJson(workflowDefinitionJson, entitiesJson)
  if (!merged.success) {
    errors.push(...merged.errors)
    return { valid: false, errors, warnings: [] }
  }

  const schema = validateWorkflowDefinition(
    {
      ...merged.data,
      id: ctx.workflowId,
      name: merged.data.name?.trim() ? merged.data.name : ctx.workflowName,
      version: WORKFLOW_DEFINITION_VERSION,
      status: merged.data.status ?? 'draft',
      executor: merged.data.executor ?? { agentId: WORKFLOW_RUNTIME_AGENT_ID },
    },
    { knownTools: ctx.knownTools },
  )

  errors.push(...schema.errors.map((e) => `${WORKFLOW_DEFINITION_JSON_FILENAME}: ${e}`))

  return {
    valid: errors.length === 0,
    errors,
    warnings: schema.warnings.map((w) => `${WORKFLOW_DEFINITION_JSON_FILENAME}: ${w}`),
  }
}

/** Validate entities_definition.json and cross-check with workflow when present. */
export function validateEntitiesDefinitionJsonSource(
  ctx: WorkflowSourceValidateContext,
  entitiesDefinitionJson: string,
): WorkflowSourceValidation {
  const trimmed = entitiesDefinitionJson.trim()
  if (!trimmed) {
    return { valid: true, errors: [], warnings: [] }
  }

  const parsed = safeParseEntitiesDefinitionJson(entitiesDefinitionJson)
  if (!parsed.success) {
    return { valid: false, errors: parsed.errors, warnings: [] }
  }

  const workflowJson = readSourceFile(ctx, WORKFLOW_DEFINITION_JSON_FILENAME)
  if (!workflowJson.trim()) {
    return { valid: true, errors: [], warnings: [] }
  }

  const merged = mergeWorkflowSourceJson(workflowJson, entitiesDefinitionJson)
  if (!merged.success) {
    return { valid: false, errors: merged.errors, warnings: [] }
  }

  const schema = validateWorkflowDefinition(
    {
      ...merged.data,
      id: ctx.workflowId,
      name: merged.data.name?.trim() ? merged.data.name : ctx.workflowName,
      version: WORKFLOW_DEFINITION_VERSION,
      status: merged.data.status ?? 'draft',
      executor: merged.data.executor ?? { agentId: WORKFLOW_RUNTIME_AGENT_ID },
    },
    { knownTools: ctx.knownTools },
  )

  return {
    valid: schema.errors.length === 0,
    errors: schema.errors.map((e) => `${ENTITIES_DEFINITION_JSON_FILENAME}: ${e}`),
    warnings: schema.warnings.map((w) => `${ENTITIES_DEFINITION_JSON_FILENAME}: ${w}`),
  }
}

/** Validate merged sources into a full definition. */
export function validateMergedWorkflowSources(
  ctx: WorkflowSourceValidateContext,
  workflowDefinitionJson: string,
  entitiesDefinitionJson: string,
): WorkflowSourceValidation {
  const merged = mergeWorkflowSourceJson(workflowDefinitionJson, entitiesDefinitionJson)
  if (!merged.success) {
    return { valid: false, errors: merged.errors, warnings: [] }
  }

  const definition: WorkflowDefinition = {
    ...merged.data,
    id: ctx.workflowId,
    name: merged.data.name?.trim() ? merged.data.name : ctx.workflowName,
    version: WORKFLOW_DEFINITION_VERSION,
    status: merged.data.status ?? 'draft',
    executor: merged.data.executor ?? { agentId: WORKFLOW_RUNTIME_AGENT_ID },
  }

  const schema = validateWorkflowDefinition(definition, { knownTools: ctx.knownTools })
  return {
    valid: schema.errors.length === 0,
    errors: schema.errors,
    warnings: schema.warnings,
  }
}

/** @deprecated Use {@link validateWorkflowDefinitionJsonSource} */
export function validateDefinitionJsonSource(
  ctx: WorkflowSourceValidateContext,
  definitionJson: string,
): WorkflowSourceValidation {
  return validateWorkflowDefinitionJsonSource(ctx, definitionJson)
}

export function attachValidationMessage(
  base: Record<string, unknown>,
  validation: WorkflowSourceValidation,
): Record<string, unknown> {
  return {
    ...base,
    valid: validation.valid,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    message: validation.valid
      ? 'Saved and validated successfully.'
      : `Saved but validation failed — fix these errors and call edit again:\n${validation.errors.map((e) => `- ${e}`).join('\n')}`,
  }
}
