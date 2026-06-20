import { describe, expect, it } from 'vitest'
import { WORKFLOW_DEFINITION_VERSION } from './schema'
import {
  bindWorkflowInputs,
  matchChannelMessageTrigger,
  workflowHasTrigger,
} from './inputs'

const definition = {
  version: WORKFLOW_DEFINITION_VERSION,
  id: 'wf-inputs',
  name: 'Inputs',
  status: 'draft' as const,
  executor: { agentId: 'skill:default' },
  inputs: [
    { key: 'count', type: 'number' as const, required: true },
    { key: 'enabled', type: 'boolean' as const },
    { key: 'label', type: 'string' as const },
  ],
  triggers: [
    { type: 'manual' as const },
    { type: 'channel_message' as const, channelId: 'slack', match: '/run' },
  ],
  steps: [
    { id: 'step_1', type: 'task' as const, expression: { tool: 'run_script' } },
  ],
}

describe('bindWorkflowInputs', () => {
  it('binds manual and channel form inputs with type coercion', () => {
    const manual = bindWorkflowInputs(definition, {
      type: 'manual',
      inputs: {
        count: '12',
        enabled: 'true',
        label: '',
      },
    })

    expect(manual).toEqual({
      count: 12,
      enabled: true,
      label: null,
    })

    const form = bindWorkflowInputs(definition, {
      type: 'channel_form',
      formId: 'feedback',
      fields: {
        count: 7,
        enabled: false,
        label: 'daily',
      },
    })

    expect(form).toEqual({
      count: 7,
      enabled: false,
      label: 'daily',
    })
  })

  it('binds channel message and webhook payloads', () => {
    expect(
      bindWorkflowInputs(definition, {
        type: 'channel_message',
        channelId: 'slack',
        senderId: 'user-1',
        text: '/run now',
        occurredAt: '2026-06-18T00:00:00.000Z',
      }),
    ).toEqual({
      message: '/run now',
      channelId: 'slack',
      senderId: 'user-1',
    })

    expect(
      bindWorkflowInputs(definition, {
        type: 'webhook',
        path: '/hook',
        body: { ok: true, count: 3 },
        headers: { 'x-test': '1' },
      }),
    ).toEqual({ ok: true, count: 3 })
  })
})

describe('workflow trigger helpers', () => {
  it('detects triggers and matches channel message prefixes', () => {
    expect(workflowHasTrigger(definition, 'manual')).toBe(true)
    expect(workflowHasTrigger(definition, 'webhook')).toBe(false)

    expect(
      matchChannelMessageTrigger(definition, 'slack', '/run build'),
    ).toMatchObject({
      type: 'channel_message',
      channelId: 'slack',
      match: '/run',
    })
    expect(
      matchChannelMessageTrigger(definition, 'discord', '/run build'),
    ).toBeNull()
    expect(
      matchChannelMessageTrigger(definition, 'slack', 'no match'),
    ).toBeNull()
  })
})
