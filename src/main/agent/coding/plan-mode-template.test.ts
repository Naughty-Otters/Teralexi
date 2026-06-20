import { describe, expect, it } from 'vitest'
import { emptyTodoList, replaceTodos } from '@shared/agent/todos'
import {
  PLAN_MODE_TEMPLATE,
  renderPlanModeMarkdown,
  renderPlanMarkdownFromTodoList,
} from './plan-mode-template'

describe('plan-mode-template', () => {
  it('PLAN_MODE_TEMPLATE uses Jinja2 step expressions', () => {
    expect(PLAN_MODE_TEMPLATE).toContain('{% for step in steps')
    expect(PLAN_MODE_TEMPLATE).toContain('{{ loop.index }}. {{ step.content }}')
    expect(PLAN_MODE_TEMPLATE).toContain('step.success_criteria')
    expect(PLAN_MODE_TEMPLATE).toContain('step.verify_command')
  })

  it('renders empty placeholder steps when no todos', () => {
    const md = renderPlanModeMarkdown({ steps: [] })
    expect(md).toContain('## Steps')
    expect(md).toContain('<!-- Actionable step -->')
  })

  it('renders numbered steps with status markers', () => {
    const list = replaceTodos([
      { content: 'Set up auth', status: 'pending' },
      { content: 'Add tests', status: 'in_progress' },
    ])
    const md = renderPlanMarkdownFromTodoList(list)
    expect(md).toContain('1. Set up auth')
    expect(md).toContain('2. Add tests — _in_progress_')
  })

  it('renders success_criteria and verify_command when present', () => {
    const list = replaceTodos([
      {
        content: 'Add auth middleware',
        status: 'pending',
        success_criteria: 'Auth tests pass',
        verify_command: 'npm test auth',
      },
    ])
    const md = renderPlanMarkdownFromTodoList(list)
    expect(md).toContain('1. Add auth middleware')
    expect(md).toContain('- Verify: Auth tests pass')
    expect(md).toContain('- Command: `npm test auth`')
  })

  it('bootstrap-style empty list matches rendered template', () => {
    const md = renderPlanMarkdownFromTodoList(emptyTodoList())
    expect(md).toContain('## Steps')
  })
})
