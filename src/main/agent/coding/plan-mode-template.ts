import { existsSync, readFileSync } from 'node:fs'
import type { TodoList, TrackedTodo } from '@shared/agent/todos'
import { renderJinja2 } from './plan-mode-jinja'

/** Jinja2-style plan markdown; `steps` is filled from the todo list on each write. */
export const PLAN_MODE_TEMPLATE = `
## Steps
{% if steps -%}
{% for step in steps -%}
{{ loop.index }}. {{ step.content }}{% if step.status != 'pending' %} — _{{ step.status }}_{% endif %}
{% if step.success_criteria -%}
   - Verify: {{ step.success_criteria }}
{% endif -%}
{% if step.verify_command -%}
   - Command: \`{{ step.verify_command }}\`
{% endif %}

{% endfor -%}
{% else -%}
1. <!-- Actionable step -->
2. 
{% endif -%}
`

export type PlanTemplateStep = {
  content: string
  status: string
  success_criteria?: string
  verify_command?: string
}

export type PlanTemplateContext = {
  steps: PlanTemplateStep[]
}

export function todosToPlanSteps(todos: TrackedTodo[]): PlanTemplateStep[] {
  return todos
    .map((todo) => {
      const step: PlanTemplateStep = {
        content: todo.content.trim(),
        status: todo.status,
      }
      if (todo.success_criteria?.trim()) {
        step.success_criteria = todo.success_criteria.trim()
      }
      if (todo.verify_command?.trim()) {
        step.verify_command = todo.verify_command.trim()
      }
      return step
    })
    .filter((step) => step.content.length > 0)
}

export function renderPlanModeMarkdown(ctx: PlanTemplateContext): string {
  return renderJinja2(PLAN_MODE_TEMPLATE, ctx)
}

export function planContextFromTodoList(list: TodoList): PlanTemplateContext {
  return { steps: todosToPlanSteps(list.todos) }
}

function readSectionBody(content: string, heading: string): string | undefined {
  const pattern = new RegExp(
    `^##\\s+${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`,
    'im',
  )
  const match = content.match(pattern)
  const body = match?.[1]?.trimEnd()
  return body || undefined
}


export function renderPlanMarkdownFromTodoList(list: TodoList): string {
  return renderPlanModeMarkdown(planContextFromTodoList(list))
}
