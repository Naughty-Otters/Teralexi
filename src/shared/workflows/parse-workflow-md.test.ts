import { describe, expect, it } from 'vitest'
import { parseWorkflowMd } from './parse-workflow-md'

describe('parseWorkflowMd', () => {
  it('parses workflow metadata, triggers, steps, flow, and conditionals', () => {
    const result = parseWorkflowMd(`
# Daily workflow

## Description
Summarize the daily status.

## Triggers
- type: manual
- type: schedule
 - cron: 0 8 * * 1-5
 - timezone: UTC
- type: channel_message
 - channelId: slack
 - match: /start
- type: channel_form
 - formId: intake_form
 - channelId: slack
- type: webhook
 - path: /webhook

### step_one (task)
- title: First task
- tool: run_script
- prompt: Do the thing
- stage: custom
- precondition: ready

### collect_profile (channel)
- title: Collect profile
- channelId: slack
- action: collect_form
- form: profile_form
- template: Fill in the form
- target: user

### gather_todos (plan_foreach)
- title: Gather todos
- todosFrom: steps
- tool: list_todos
- name: one
- name: two

### review_todos (plan_foreach)
- title: Review todos
- todosFrom: steps
- tool: review_todos

## Flow
gather_todos -> step_one -> collect_profile

## Conditionals
- after: step_one
 - when: approved
 - then: collect_profile
 - else: review_todos
`)

    expect(result.errors).toEqual([])
    expect(result.partial.name).toBe('Daily workflow')
    expect(result.partial.description).toBe('Summarize the daily status.')
    expect(result.partial.triggers).toEqual([
      { type: 'manual' },
      { type: 'schedule', cron: '0 8 * * 1-5', timezone: 'UTC' },
      { type: 'channel_message', channelId: 'slack', match: '/start' },
      { type: 'channel_form', formId: 'intake_form', channelId: 'slack' },
      { type: 'webhook', path: '/webhook' },
    ])
    expect(result.partial.steps?.map((step) => step.id)).toEqual([
      'gather_todos',
      'step_one',
      'collect_profile',
      'review_todos',
    ])
    expect(result.partial.steps?.[0]).toMatchObject({
      type: 'plan_foreach',
      title: 'Gather todos',
      todosFrom: 'inline',
      todos: [{ name: 'one' }, { name: 'two' }],
      expression: { tool: 'list_todos' },
    })
    expect(result.partial.steps?.[1]).toMatchObject({
      type: 'task',
      title: 'First task',
      tools: ['run_script'],
      expression: {
        tool: 'run_script',
        prompt: 'Do the thing',
        title: 'First task',
        precondition: 'ready',
      },
      stage: 'custom',
      precondition: 'ready',
    })
    expect(result.partial.steps?.[2]).toMatchObject({
      type: 'channel',
      title: 'Collect profile',
      channelId: 'slack',
      action: 'collect_form',
      form: 'profile_form',
      template: 'Fill in the form',
      target: 'user',
    })
    expect(result.partial.conditionals).toEqual([
      {
        afterStepId: 'step_one',
        when: 'approved',
        thenStepIds: ['collect_profile'],
        elseStepIds: ['review_todos'],
      },
    ])
  })

  it('reports invalid step sections and missing step content', () => {
    const result = parseWorkflowMd(`
# Broken workflow

### invalid heading
- title: Missing step type

### notify (channel)
- title: Notify
- channelId: slack
`)

    expect(result.partial.steps).toBeUndefined()
    expect(
      result.errors.some((error) => error.includes('Invalid step heading')),
    ).toBe(true)
    expect(
      result.errors.some((error) => error.includes('requires action')),
    ).toBe(true)
    expect(
      result.errors.some((error) => error.includes('no steps found')),
    ).toBe(true)
  })
})
