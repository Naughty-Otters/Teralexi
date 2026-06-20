import type { WorkflowDefinition, WorkflowStep, WorkflowTrigger } from './schema'

function sanitizeMermaidId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function triggerNodeId(trigger: WorkflowTrigger, index: number): string {
  return `trigger_${index}_${sanitizeMermaidId(trigger.type)}`
}

function stepNodeId(step: WorkflowStep): string {
  return sanitizeMermaidId(step.id)
}

function stepShape(step: WorkflowStep): string {
  if (step.type === 'channel' && step.action === 'collect_form') {
    return `[/${step.title ?? step.id}/]`
  }
  if (step.type === 'plan_foreach') {
    return `[[${step.title ?? step.id}]]`
  }
  return `[${step.title ?? step.id}]`
}

function triggerLabel(trigger: WorkflowTrigger): string {
  switch (trigger.type) {
    case 'manual':
      return 'Manual run'
    case 'schedule':
      return `Schedule ${trigger.cron}`
    case 'channel_message':
      return `${trigger.channelId}: ${trigger.match}`
    case 'channel_form':
      return `Form ${trigger.formId}`
    case 'webhook':
      return `Webhook ${trigger.path}`
    default:
      return 'Trigger'
  }
}

/** Generate a Mermaid flowchart from a workflow definition. */
export function workflowDefinitionToMermaid(definition: WorkflowDefinition): string {
  const lines: string[] = ['flowchart TD']
  const triggers = definition.triggers ?? [{ type: 'manual' as const }]
  const stepIds = definition.steps.map(stepNodeId)

  for (let i = 0; i < triggers.length; i += 1) {
    const trigger = triggers[i]!
    const tid = triggerNodeId(trigger, i)
    lines.push(`  ${tid}(("${triggerLabel(trigger)}"))`)
    if (stepIds[0]) {
      lines.push(`  ${tid} --> ${stepIds[0]}`)
    }
  }

  for (let i = 0; i < definition.steps.length; i += 1) {
    const step = definition.steps[i]!
    const sid = stepNodeId(step)
    lines.push(`  ${sid}${stepShape(step)}`)

    const nextId = stepIds[i + 1]
    if (nextId) {
      lines.push(`  ${sid} --> ${nextId}`)
    }
  }

  for (const branch of definition.conditionals ?? []) {
    const afterId = stepNodeId(
      definition.steps.find((s) => s.id === branch.afterStepId) ?? {
        id: branch.afterStepId,
        type: 'task',
      },
    )
    const thenTarget = branch.thenStepIds[0]
      ? stepNodeId(
          definition.steps.find((s) => s.id === branch.thenStepIds[0]) ?? {
            id: branch.thenStepIds[0]!,
            type: 'task',
          },
        )
      : null
    const elseTarget = branch.elseStepIds?.[0]
      ? stepNodeId(
          definition.steps.find((s) => s.id === branch.elseStepIds![0]) ?? {
            id: branch.elseStepIds![0]!,
            type: 'task',
          },
        )
      : null

    const decisionId = `${afterId}_when_${sanitizeMermaidId(branch.when)}`
    lines.push(`  ${decisionId}{${branch.when}}`)
    lines.push(`  ${afterId} --> ${decisionId}`)
    if (thenTarget) {
      lines.push(`  ${decisionId} -->|pass| ${thenTarget}`)
    }
    if (elseTarget) {
      lines.push(`  ${decisionId} -->|fail| ${elseTarget}`)
    }
  }

  return lines.join('\n')
}
