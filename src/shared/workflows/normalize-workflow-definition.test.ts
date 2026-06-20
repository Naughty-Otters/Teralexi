import { describe, expect, it } from 'vitest'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { normalizeWorkflowDefinitionRaw } from './normalize-workflow-definition'
import { parseWorkflowDefinition, WORKFLOW_DEFINITION_VERSION } from './schema'

const base = {
  version: WORKFLOW_DEFINITION_VERSION,
  id: 'wf-joke',
  name: 'Daily joke',
  status: 'draft' as const,
  executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
  steps: [
    {
      id: 'write_joke',
      type: 'task' as const,
      expression: { tool: 'run_script', prompt: 'Write a joke' },
    },
  ],
}

describe('normalizeWorkflowDefinitionRaw', () => {
  it('fills missing schedule cron with a daily default', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      triggers: [{ type: 'schedule' }],
    }) as Record<string, unknown>

    const triggers = normalized.triggers as Array<Record<string, unknown>>
    expect(triggers[0]?.type).toBe('schedule')
    expect(triggers[0]?.cron).toBe('0 9 * * *')

    expect(() => parseWorkflowDefinition(normalized)).not.toThrow()
  })

  it('accepts alternate cron field names', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      triggers: [{ type: 'schedule', cronExpression: '0 8 * * 1-5' }],
    }) as Record<string, unknown>

    const triggers = normalized.triggers as Array<Record<string, unknown>>
    expect(triggers[0]?.cron).toBe('0 8 * * 1-5')
    expect(() => parseWorkflowDefinition(normalized)).not.toThrow()
  })

  it('drops tool mocks missing a tool name', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      triggers: [{ type: 'manual' }],
      mocks: {
        tools: [
          { fixture: { ok: true } },
          { toolName: 'run_script', fixture: { text: 'hi' } },
        ],
      },
    }) as Record<string, unknown>

    const mocks = normalized.mocks as Record<string, unknown>
    const tools = mocks.tools as Array<Record<string, unknown>>
    expect(tools).toHaveLength(1)
    expect(tools[0]?.tool).toBe('run_script')
    expect(() => parseWorkflowDefinition(normalized)).not.toThrow()
  })

  it('omits mocks entirely when all entries are invalid', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      triggers: [{ type: 'manual' }],
      mocks: { tools: [{ fixture: {} }] },
    }) as Record<string, unknown>

    expect(normalized.mocks).toBeUndefined()
    expect(() => parseWorkflowDefinition(normalized)).not.toThrow()
  })

  it('defaults missing executor to workflow-runtime', () => {
    const { executor: _removed, ...withoutExecutor } = base
    const normalized = normalizeWorkflowDefinitionRaw(
      withoutExecutor,
    ) as Record<string, unknown>
    expect(normalized.executor).toEqual({ agentId: WORKFLOW_RUNTIME_AGENT_ID })
  })

  it('remaps skill:default executor to workflow-runtime', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      executor: { agentId: 'skill:default' },
    }) as Record<string, unknown>
    expect(normalized.executor).toEqual({ agentId: WORKFLOW_RUNTIME_AGENT_ID })
  })

  it('normalizes alternate trigger shapes', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      triggers: [
        { type: 'channel_message', channel: 'alerts', pattern: '^start' },
        { type: 'channel_form', form: 'feedback', channel: 'slack' },
        { type: 'webhook', url: '/hook' },
        { type: 'daily', schedule: '0 8 * * 1-5', timezone: 'UTC' },
      ],
    }) as Record<string, unknown>

    expect(normalized.triggers).toEqual([
      { type: 'channel_message', channelId: 'alerts', match: '^start' },
      { type: 'channel_form', formId: 'feedback', channelId: 'slack' },
      { type: 'webhook', path: '/hook' },
      { type: 'schedule', cron: '0 8 * * 1-5', timezone: 'UTC' },
    ])
  })

  it('normalizes entities and mocks with invalid entries removed', () => {
    const normalized = normalizeWorkflowDefinitionRaw({
      ...base,
      triggers: [{ type: 'manual' }],
      mocks: {
        http: [
          { path: '/ping', body: { ok: true }, method: 'GET' },
          { body: {} },
        ],
        tools: [
          { name: 'run_script', fixture: { ok: true }, inputMatch: { foo: 1 } },
          { fixture: { bad: true } },
        ],
      },
      entities: [
        {
          id: 'customer',
          name: 'Customer',
          description: 'Person',
          fields: [
            {
              key: 'email',
              type: 'string',
              label: 'Email',
              required: true,
              description: 'Address',
              source: {
                kind: 'tool',
                tool: 'lookup_email',
                stepId: 'lookup',
                resultPath: 'email',
              },
            },
            {
              key: 'source',
              type: 'string',
              source: {
                kind: 'user_input',
                formStepId: 'collect',
                inputKey: 'source',
              },
            },
            {
              type: 'string',
              source: { kind: 'user_input' },
            },
          ],
        },
        {
          id: 'invalid',
          name: 'Invalid',
          fields: [],
        },
      ],
    }) as Record<string, unknown>

    const entities = normalized.entities as Array<Record<string, unknown>>
    expect(entities).toHaveLength(1)
    expect(entities[0]?.fields).toHaveLength(2)

    const mocks = normalized.mocks as Record<string, unknown>
    expect((mocks.http as Array<unknown>).length).toBe(1)
    expect((mocks.tools as Array<unknown>).length).toBe(1)
  })
})
