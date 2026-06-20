import type { WorkflowDefinition, WorkflowInputField, WorkflowTrigger } from './schema'

export type WorkflowRunInputs = Record<string, unknown>

export type TriggerPayload =
  | { type: 'manual'; inputs?: WorkflowRunInputs }
  | { type: 'schedule'; scheduledAt: string }
  | {
      type: 'channel_message'
      channelId: string
      senderId: string
      text: string
      occurredAt: string
    }
  | {
      type: 'channel_form'
      formId: string
      fields: WorkflowRunInputs
    }
  | { type: 'webhook'; path: string; body: unknown; headers?: Record<string, string> }

function coerceFieldValue(
  field: WorkflowInputField,
  raw: unknown,
): unknown {
  if (raw == null || raw === '') {
    return field.required ? undefined : null
  }
  switch (field.type) {
    case 'number':
      return typeof raw === 'number' ? raw : Number(raw)
    case 'boolean':
      if (typeof raw === 'boolean') return raw
      return String(raw).toLowerCase() === 'true'
    default:
      return String(raw)
  }
}

/** Map trigger payload + workflow input schema into a bound input object. */
export function bindWorkflowInputs(
  definition: WorkflowDefinition,
  payload: TriggerPayload,
): WorkflowRunInputs {
  const inputs: WorkflowRunInputs = {}
  const fields = definition.inputs ?? []

  if (payload.type === 'manual' && payload.inputs) {
    for (const field of fields) {
      const raw = payload.inputs[field.key]
      const value = coerceFieldValue(field, raw)
      if (value !== undefined) {
        inputs[field.key] = value
      }
    }
    return inputs
  }

  if (payload.type === 'channel_form') {
    for (const field of fields) {
      const raw = payload.fields[field.key]
      const value = coerceFieldValue(field, raw)
      if (value !== undefined) {
        inputs[field.key] = value
      }
    }
    return inputs
  }

  if (payload.type === 'channel_message') {
    inputs.message = payload.text
    inputs.channelId = payload.channelId
    inputs.senderId = payload.senderId
    return inputs
  }

  if (payload.type === 'webhook' && payload.body && typeof payload.body === 'object') {
    return { ...(payload.body as Record<string, unknown>) }
  }

  return inputs
}

export function workflowHasTrigger(
  definition: WorkflowDefinition,
  type: WorkflowTrigger['type'],
): boolean {
  return (definition.triggers ?? []).some((t) => t.type === type)
}

export function matchChannelMessageTrigger(
  definition: WorkflowDefinition,
  channelId: string,
  text: string,
): WorkflowTrigger | null {
  for (const trigger of definition.triggers ?? []) {
    if (trigger.type !== 'channel_message') continue
    if (trigger.channelId !== channelId) continue
    if (text.trim().startsWith(trigger.match.trim())) {
      return trigger
    }
  }
  return null
}
