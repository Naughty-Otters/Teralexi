import type { WorkflowBusinessEntity, WorkflowEntityFieldSource } from './schema'

function formatFieldSource(source: WorkflowEntityFieldSource): string {
  if (source.kind === 'user_input') {
    const parts = ['User input form']
    if (source.formStepId) parts.push(`step \`${source.formStepId}\``)
    if (source.inputKey) parts.push(`field \`${source.inputKey}\``)
    return parts.join(' · ')
  }
  const parts = [`Tool \`${source.tool}\``]
  if (source.stepId) parts.push(`step \`${source.stepId}\``)
  if (source.resultPath) parts.push(`path \`${source.resultPath}\``)
  return parts.join(' · ')
}

function formatFieldType(type: string, required?: boolean): string {
  const req = required ? ', required' : ', optional'
  return `\`${type}\`${req}`
}

function renderEntity(entity: WorkflowBusinessEntity): string {
  const lines: string[] = []
  lines.push(`## ${entity.name}`)
  lines.push('')
  if (entity.description?.trim()) {
    lines.push(entity.description.trim())
    lines.push('')
  }
  lines.push(`| Field | Type | Source | Notes |`)
  lines.push(`| --- | --- | --- | --- |`)
  for (const field of entity.fields) {
    const label = field.label?.trim() || field.key
    const notes = field.description?.trim() ?? ''
    lines.push(
      `| **${label}** (\`${field.key}\`) | ${formatFieldType(field.type, field.required)} | ${formatFieldSource(field.source)} | ${notes} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

/** Render business entities as markdown documentation. */
export function workflowEntitiesToMarkdown(
  entities: WorkflowBusinessEntity[] | undefined,
): string {
  if (!entities?.length) return ''
  const header = '# Business entities\n'
  return header + entities.map(renderEntity).join('\n')
}
