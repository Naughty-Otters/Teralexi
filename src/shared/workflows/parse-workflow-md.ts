import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
} from './schema'

export type WorkflowMdParseResult = {
  partial: Partial<WorkflowDefinition>
  errors: string[]
}

function parseYamlLikeLines(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*-\s*(?:-\s*)?([a-zA-Z0-9_]+):\s*(.+)$/)
    if (match) {
      out[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, '')
    }
  }
  return out
}

function parseTriggerBlock(block: string): WorkflowTrigger | null {
  const props = parseYamlLikeLines(block)
  const type = props.type?.trim()
  if (!type) return null

  switch (type) {
    case 'manual':
      return { type: 'manual' }
    case 'schedule':
      return {
        type: 'schedule',
        cron: props.cron ?? '0 9 * * *',
        timezone: props.timezone,
      }
    case 'channel_message':
      if (!props.channelId || !props.match) return null
      return {
        type: 'channel_message',
        channelId: props.channelId,
        match: props.match,
      }
    case 'channel_form':
      if (!props.formId) return null
      return {
        type: 'channel_form',
        formId: props.formId,
        channelId: props.channelId,
      }
    case 'webhook':
      if (!props.path) return null
      return { type: 'webhook', path: props.path }
    default:
      return null
  }
}

function parseStepSection(
  heading: string,
  body: string,
  errors: string[],
): WorkflowStep | null {
  const headingMatch = heading.match(/^###\s+(\S+)\s+\((task|channel|plan_foreach)\)/i)
  if (!headingMatch) {
    errors.push(`Invalid step heading "${heading.trim()}": expected ### step_id (task|channel|plan_foreach)`)
    return null
  }

  const id = headingMatch[1]!
  const stepType = headingMatch[2]!.toLowerCase() as WorkflowStep['type']
  const props = parseYamlLikeLines(body)

  if (stepType === 'task') {
    const expression: Record<string, string> = {}
    if (props.tool) expression.tool = props.tool
    if (props.prompt) expression.prompt = props.prompt
    if (props.title) expression.title = props.title
    if (props.when) expression.when = props.when
    if (props.precondition) expression.precondition = props.precondition

    return {
      id,
      type: 'task',
      title: props.title,
      tools: props.tool ? [props.tool] : undefined,
      expression: Object.keys(expression).length > 0 ? expression : undefined,
      stage: props.stage,
      precondition: props.precondition,
    }
  }

  if (stepType === 'channel') {
    const channelId = props.channelId ?? props.channel
    const action = props.action as 'collect_form' | 'send_notification' | undefined
    if (!channelId) {
      errors.push(`Step "${id}": channel step requires channelId`)
      return null
    }
    if (!action) {
      errors.push(`Step "${id}": channel step requires action (collect_form | send_notification)`)
      return null
    }
    return {
      id,
      type: 'channel',
      title: props.title,
      channelId,
      action,
      form: props.form,
      template: props.template,
      target: props.target,
    }
  }

  const todos: Array<{ name: string; description?: string }> = []
  for (const line of body.split('\n')) {
    const todoMatch = line.match(/^\s*-\s*name:\s*(.+)$/)
    if (todoMatch) todos.push({ name: todoMatch[1]!.trim() })
  }

  return {
    id,
    type: 'plan_foreach',
    title: props.title,
    todosFrom: todos.length > 0 ? 'inline' : props.todosFrom as 'steps' | 'inline' | undefined,
    todos: todos.length > 0 ? todos : undefined,
    expression: props.tool ? { tool: props.tool } : undefined,
  }
}

function parseFlowOrder(flowSection: string): string[] {
  const ids: string[] = []
  for (const line of flowSection.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const segments = trimmed.split(/\s*->\s*/)
    for (const segment of segments) {
      const id = segment.trim()
      if (id && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

/** Parse workflow.md into a partial WorkflowDefinition. */
export function parseWorkflowMd(markdown: string): WorkflowMdParseResult {
  const errors: string[] = []
  const partial: Partial<WorkflowDefinition> = {}

  const titleMatch = markdown.match(/^#\s+(.+)$/m)
  if (titleMatch) {
    partial.name = titleMatch[1]!.trim()
  }

  const descriptionMatch = markdown.match(
    /##\s+Description\s*\n+([\s\S]*?)(?=\n##\s+|\n###\s+|$)/i,
  )
  if (descriptionMatch?.[1]?.trim()) {
    partial.description = descriptionMatch[1].trim()
  }

  const triggersSection = markdown.match(
    /##\s+Triggers\s*\n+([\s\S]*?)(?=\n##\s+|\n###\s+|$)/i,
  )
  if (triggersSection?.[1]) {
    const blocks = triggersSection[1].split(/\n(?=-\s*type:)/)
    const triggers: WorkflowTrigger[] = []
    for (const block of blocks) {
      const trigger = parseTriggerBlock(block)
      if (trigger) triggers.push(trigger)
    }
    if (triggers.length > 0) partial.triggers = triggers
  }

  const stepSections = [...markdown.matchAll(/###\s+[^\n]+\s*\n([\s\S]*?)(?=\n###\s+|\n##\s+|$)/g)]
  const steps: WorkflowStep[] = []
  for (const match of stepSections) {
    const headingLine = match[0].split('\n')[0] ?? ''
    const body = match[1] ?? ''
    const step = parseStepSection(headingLine, body, errors)
    if (step) steps.push(step)
  }

  const flowSection = markdown.match(/##\s+Flow\s*\n+([\s\S]*?)(?=\n##\s+|$)/i)?.[1]
  if (flowSection && steps.length > 1) {
    const order = parseFlowOrder(flowSection)
    if (order.length > 0) {
      const byId = new Map(steps.map((s) => [s.id, s]))
      const ordered = order.map((id) => byId.get(id)).filter(Boolean) as WorkflowStep[]
      const remaining = steps.filter((s) => !order.includes(s.id))
      partial.steps = [...ordered, ...remaining]
    } else {
      partial.steps = steps
    }
  } else if (steps.length > 0) {
    partial.steps = steps
  }

  const conditionalsSection = markdown.match(
    /##\s+Conditionals\s*\n+([\s\S]*?)(?=\n##\s+|$)/i,
  )
  if (conditionalsSection?.[1]) {
    const blocks = conditionalsSection[1].split(/\n(?=-\s*after:)/)
    const conditionals: NonNullable<WorkflowDefinition['conditionals']> = []
    for (const block of blocks) {
      const props = parseYamlLikeLines(block)
      if (!props.after || !props.when || !props.then) continue
      conditionals.push({
        afterStepId: props.after,
        when: props.when,
        thenStepIds: props.then.split(/\s*,\s*/).filter(Boolean),
        elseStepIds: props.else
          ? props.else.split(/\s*,\s*/).filter(Boolean)
          : undefined,
      })
    }
    if (conditionals.length > 0) partial.conditionals = conditionals
  }

  if (!partial.steps?.length) {
    errors.push('workflow.md: no steps found (add ## Steps with ### step_id (type) sections)')
  }

  return { partial, errors }
}
