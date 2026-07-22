import type { WorkflowDefinition, WorkflowStep } from '@shared/workflows/schema'

export type WorkflowValidationResult = {
  errors: string[]
  warnings: string[]
}

const READ_ONLY_TOOLS = new Set([
  'read_file',
  'web_search',
  'web_scrape',
  'lsp',
  'shell',
  'read_todos',
])

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
  options?: { knownTools?: Set<string> },
): WorkflowValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const stepIds = new Set<string>()

  for (const step of definition.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`)
    }
    stepIds.add(step.id)

    if (step.type === 'channel') {
      if (step.action === 'collect_form' && !step.form?.trim()) {
        errors.push(`Step ${step.id}: collect_form requires form path`)
      }
      if (step.action === 'send_notification' && !step.template?.trim()) {
        warnings.push(`Step ${step.id}: send_notification has empty template`)
      }
    }

    if (step.type === 'task' && step.expression?.tool && options?.knownTools) {
      const tools = [step.expression.tool, step.expression.else_tool].filter(
        Boolean,
      ) as string[]
      for (const tool of tools) {
        if (!options.knownTools.has(tool)) {
          warnings.push(`Step ${step.id}: unknown tool "${tool}"`)
        }
      }
    }
  }

  for (const branch of definition.conditionals ?? []) {
    if (!stepIds.has(branch.afterStepId)) {
      errors.push(`Conditional references missing step: ${branch.afterStepId}`)
    }
    for (const id of [...branch.thenStepIds, ...(branch.elseStepIds ?? [])]) {
      if (!stepIds.has(id)) {
        errors.push(`Conditional references missing step: ${id}`)
      }
    }
  }

  for (const input of definition.inputs ?? []) {
    if (!input.key.trim()) {
      errors.push('Input field missing key')
    }
  }

  for (const entity of definition.entities ?? []) {
    if (!entity.id.trim()) {
      errors.push('Entity missing id')
    }
    const fieldKeys = new Set<string>()
    for (const field of entity.fields) {
      if (fieldKeys.has(field.key)) {
        errors.push(`Entity ${entity.id}: duplicate field key "${field.key}"`)
      }
      fieldKeys.add(field.key)

      if (field.source.kind === 'tool') {
        if (options?.knownTools && !options.knownTools.has(field.source.tool)) {
          warnings.push(
            `Entity ${entity.id}.${field.key}: unknown tool "${field.source.tool}"`,
          )
        }
        if (field.source.stepId && !stepIds.has(field.source.stepId)) {
          warnings.push(
            `Entity ${entity.id}.${field.key}: tool source references missing step "${field.source.stepId}"`,
          )
        }
      }

      if (field.source.kind === 'user_input' && field.source.formStepId) {
        const formStepId = field.source.formStepId
        const formStep = definition.steps.find((s) => s.id === formStepId)
        if (!formStep) {
          warnings.push(
            `Entity ${entity.id}.${field.key}: formStepId "${formStepId}" not found`,
          )
        } else if (formStep.type !== 'channel' || formStep.action !== 'collect_form') {
          warnings.push(
            `Entity ${entity.id}.${field.key}: formStepId "${formStepId}" is not a collect_form channel step`,
          )
        }
      }
    }
  }

  if ((definition.entities ?? []).length === 0) {
    warnings.push('No business entities defined')
  }

  if (!definition.executor.agentId.trim()) {
    errors.push('Executor agentId is required')
  }

  if ((definition.triggers ?? []).length === 0) {
    warnings.push('No triggers defined; workflow can only be run manually from UI')
  }

  return { errors, warnings }
}

export function definitionDiffSummary(
  previous: WorkflowDefinition | null,
  next: WorkflowDefinition,
): string[] {
  if (!previous) {
    return [`Created workflow "${next.name}" with ${next.steps.length} step(s)`]
  }

  const lines: string[] = []
  if (previous.name !== next.name) {
    lines.push(`Name: ${previous.name} → ${next.name}`)
  }

  const prevStepIds = new Set(previous.steps.map((s) => s.id))
  const nextStepIds = new Set(next.steps.map((s) => s.id))

  for (const step of next.steps) {
    if (!prevStepIds.has(step.id)) {
      lines.push(`Added step: ${step.id}`)
    }
  }
  for (const step of previous.steps) {
    if (!nextStepIds.has(step.id)) {
      lines.push(`Removed step: ${step.id}`)
    }
  }

  for (const step of next.steps) {
    const prev = previous.steps.find((s) => s.id === step.id)
    if (prev && JSON.stringify(prev) !== JSON.stringify(step)) {
      lines.push(`Modified step: ${step.id}`)
    }
  }

  const prevEntityIds = new Set((previous.entities ?? []).map((e) => e.id))
  const nextEntityIds = new Set((next.entities ?? []).map((e) => e.id))
  for (const entity of next.entities ?? []) {
    if (!prevEntityIds.has(entity.id)) {
      lines.push(`Added entity: ${entity.id}`)
    }
  }
  for (const entity of previous.entities ?? []) {
    if (!nextEntityIds.has(entity.id)) {
      lines.push(`Removed entity: ${entity.id}`)
    }
  }
  for (const entity of next.entities ?? []) {
    const prev = (previous.entities ?? []).find((e) => e.id === entity.id)
    if (prev && JSON.stringify(prev) !== JSON.stringify(entity)) {
      lines.push(`Modified entity: ${entity.id}`)
    }
  }

  return lines.length > 0 ? lines : ['No structural changes']
}

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName)
}

export function listStepToolNames(step: WorkflowStep): string[] {
  if (step.type !== 'task') return []
  const names = [step.expression?.tool, step.expression?.else_tool].filter(
    (t): t is string => Boolean(t?.trim()),
  )
  return [...new Set([...(step.tools ?? []), ...names])]
}
