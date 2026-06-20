import { describe, expect, it } from 'vitest'
import {
  parseWorkflowDefinition,
  safeParseWorkflowDefinition,
  WORKFLOW_DEFINITION_VERSION,
} from './schema'
import { workflowDefinitionToMermaid } from './mermaid'
import { bindWorkflowInputs } from './inputs'
import { workflowDefinitionToAgentFlowDsl } from './to-agent-flow-dsl'

const sampleDefinition = {
  version: WORKFLOW_DEFINITION_VERSION,
  id: 'wf-onboard',
  name: 'Onboard customer',
  status: 'draft' as const,
  executor: { agentId: 'skill:default' },
  inputs: [{ key: 'customer_email', type: 'string' as const, required: true }],
  triggers: [{ type: 'manual' as const }],
  steps: [
    {
      id: 'validate',
      type: 'task' as const,
      title: 'Validate input',
      expression: { tool: 'read_file' },
    },
    {
      id: 'notify',
      type: 'channel' as const,
      channelId: 'slack',
      action: 'send_notification' as const,
      template: 'Onboarded {{customer_email}}',
    },
  ],
}

describe('workflow schema', () => {
  it('parses a valid workflow definition', () => {
    const parsed = parseWorkflowDefinition(sampleDefinition)
    expect(parsed.id).toBe('wf-onboard')
    expect(parsed.steps).toHaveLength(2)
  })

  it('parses business entities with field sources', () => {
    const parsed = parseWorkflowDefinition({
      ...sampleDefinition,
      entities: [
        {
          id: 'customer',
          name: 'Customer',
          fields: [
            {
              key: 'email',
              type: 'email',
              source: {
                kind: 'user_input',
                formStepId: 'notify',
                inputKey: 'email',
              },
            },
          ],
        },
      ],
    })
    expect(parsed.entities?.[0]?.fields[0]?.source.kind).toBe('user_input')
  })

  it('rejects empty steps', () => {
    const result = safeParseWorkflowDefinition({
      ...sampleDefinition,
      steps: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('workflowDefinitionToMermaid', () => {
  it('includes triggers and steps', () => {
    const mermaid = workflowDefinitionToMermaid(
      parseWorkflowDefinition(sampleDefinition),
    )
    expect(mermaid).toContain('flowchart TD')
    expect(mermaid).toContain('Manual run')
    expect(mermaid).toContain('validate')
    expect(mermaid).toContain('notify')
  })

  it('renders schedule, channel form, webhook, collect form, and plan foreach shapes', () => {
    const mermaid = workflowDefinitionToMermaid(
      parseWorkflowDefinition({
        version: WORKFLOW_DEFINITION_VERSION,
        id: 'wf-graph',
        name: 'Graph',
        status: 'draft' as const,
        executor: { agentId: 'skill:default' },
        triggers: [
          { type: 'schedule', cron: '0 8 * * 1-5', timezone: 'UTC' },
          { type: 'channel_form', formId: 'intake_form' },
          { type: 'webhook', path: '/hook' },
        ],
        conditionals: [
          {
            afterStepId: 'review',
            when: 'approved',
            thenStepIds: ['publish'],
            elseStepIds: ['reject'],
          },
        ],
        steps: [
          {
            id: 'collect',
            type: 'channel' as const,
            title: 'Collect',
            channelId: 'slack',
            action: 'collect_form' as const,
          },
          {
            id: 'review',
            type: 'task' as const,
            title: 'Review',
            expression: { tool: 'run_script' },
          },
          {
            id: 'foreach',
            type: 'plan_foreach' as const,
            title: 'Loop',
            todosFrom: 'inline',
            todos: [{ name: 'item one' }],
          },
          {
            id: 'publish',
            type: 'task' as const,
            title: 'Publish',
            expression: { tool: 'run_script' },
          },
          {
            id: 'reject',
            type: 'task' as const,
            title: 'Reject',
            expression: { tool: 'run_script' },
          },
        ],
      }),
    )

    expect(mermaid).toContain('Schedule 0 8 * * 1-5')
    expect(mermaid).toContain('Form intake_form')
    expect(mermaid).toContain('Webhook /hook')
    expect(mermaid).toContain('/Collect/')
    expect(mermaid).toContain('[[Loop]]')
    expect(mermaid).toContain('{approved}')
    expect(mermaid).toContain('-->|pass| publish')
    expect(mermaid).toContain('-->|fail| reject')
  })
})

describe('bindWorkflowInputs', () => {
  it('binds manual inputs from schema', () => {
    const definition = parseWorkflowDefinition(sampleDefinition)
    const bound = bindWorkflowInputs(definition, {
      type: 'manual',
      inputs: { customer_email: 'a@example.com' },
    })
    expect(bound.customer_email).toBe('a@example.com')
  })

  it('binds non-manual triggers and webhook payloads', () => {
    const definition = parseWorkflowDefinition({
      ...sampleDefinition,
      triggers: [
        { type: 'channel_message', channelId: 'slack', match: '/run' },
        { type: 'channel_form', formId: 'feedback', channelId: 'slack' },
        { type: 'webhook', path: '/hook' },
      ],
      inputs: [
        { key: 'count', type: 'number' as const },
        { key: 'enabled', type: 'boolean' as const },
      ],
    })

    expect(
      bindWorkflowInputs(definition, {
        type: 'channel_message',
        channelId: 'slack',
        senderId: 'user-1',
        text: '/run now',
        occurredAt: '2026-06-18T00:00:00.000Z',
      }),
    ).toMatchObject({
      message: '/run now',
      channelId: 'slack',
      senderId: 'user-1',
    })

    expect(
      bindWorkflowInputs(definition, {
        type: 'channel_form',
        formId: 'feedback',
        fields: { count: '3', enabled: 'true' },
      }),
    ).toEqual({ count: 3, enabled: true })

    expect(
      bindWorkflowInputs(definition, {
        type: 'webhook',
        path: '/hook',
        body: { hello: 'world' },
      }),
    ).toEqual({ hello: 'world' })
  })
})

describe('workflowDefinitionToAgentFlowDsl', () => {
  it('maps steps to pipeline entries', () => {
    const dsl = workflowDefinitionToAgentFlowDsl(
      parseWorkflowDefinition(sampleDefinition),
    )
    expect(dsl.pipeline).toHaveLength(2)
    expect(dsl.pipeline[0]?.stage).toBe('toolLoop')
  })

  it('maps collect_form, send_notification, foreach, and conditionals', () => {
    const dsl = workflowDefinitionToAgentFlowDsl(
      parseWorkflowDefinition({
        ...sampleDefinition,
        steps: [
          {
            id: 'collect',
            type: 'channel' as const,
            title: 'Collect',
            channelId: 'slack',
            action: 'collect_form' as const,
            form: 'intake_form',
          },
          {
            id: 'notify',
            type: 'channel' as const,
            title: 'Notify',
            channelId: 'slack',
            action: 'send_notification' as const,
            template: 'Done',
          },
          {
            id: 'foreach',
            type: 'plan_foreach' as const,
            title: 'Loop',
            todosFrom: 'inline',
            todos: [{ name: 'todo one' }],
          },
        ],
        conditionals: [
          {
            afterStepId: 'collect',
            when: 'approved',
            thenStepIds: ['notify'],
            elseStepIds: ['foreach'],
          },
        ],
      }),
    )

    expect(dsl.pipeline[0]).toMatchObject({
      stage: 'toolLoop',
      expression: {
        tool: 'collectFormData',
        prompt: 'Collect form intake_form via channel slack',
      },
    })
    expect(dsl.pipeline[1]).toMatchObject({
      stage: 'toolLoop',
      expression: { prompt: 'Done' },
    })
    expect(dsl.pipeline[2]).toMatchObject({
      stage: 'foreachItem',
      forEach: { preset: 'hasTodoItems' },
    })
    expect(dsl.conditionals).toEqual([
      expect.objectContaining({
        afterStage: 0,
        when: 'approved',
        then: [
          expect.objectContaining({
            stage: 'toolLoop',
            title: 'Notify',
            expression: { prompt: 'Done', title: 'Notify' },
          }),
        ],
        else: [
          expect.objectContaining({
            stage: 'foreachItem',
            title: 'Loop',
            forEach: expect.objectContaining({ preset: 'hasTodoItems' }),
          }),
        ],
      }),
    ])
  })
})
