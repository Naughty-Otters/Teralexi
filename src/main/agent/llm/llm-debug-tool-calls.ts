import type { LlmEvent } from './events'

export type LlmDebugToolCallStatus =
  | 'completed'
  | 'error'
  | 'denied'
  | 'pending'

export type LlmDebugToolCallRecord = {
  order: number
  id: string
  name: string
  input: unknown
  output?: unknown
  error?: string
  status: LlmDebugToolCallStatus
}

type ToolRow = {
  toolCallId?: string
  toolName?: string
  input?: unknown
  output?: unknown
  result?: unknown
  error?: unknown
  errorText?: string
}

function asToolRows(value: unknown): ToolRow[] {
  return Array.isArray(value) ? (value as ToolRow[]) : []
}

function outputFromRow(row: ToolRow): unknown {
  if ('output' in row && row.output !== undefined) return row.output
  if ('result' in row && row.result !== undefined) return row.result
  return undefined
}

/** Ordered tool invocations from a single LLM stream's {@link LlmEvent} list. */
export function extractOrderedToolCallsFromLlmEvents(
  events: readonly LlmEvent[],
): LlmDebugToolCallRecord[] {
  const byId = new Map<string, LlmDebugToolCallRecord>()
  const order: string[] = []
  let seq = 0

  const ensure = (
    id: string,
    name: string,
    input: unknown,
    status: LlmDebugToolCallStatus,
  ): LlmDebugToolCallRecord => {
    let rec = byId.get(id)
    if (!rec) {
      seq += 1
      rec = { order: seq, id, name, input, status }
      byId.set(id, rec)
      order.push(id)
      return rec
    }
    if (name && name !== 'unknown') rec.name = name
    if (input !== undefined) rec.input = input
    return rec
  }

  for (const event of events) {
    if (event.type === 'tool-call') {
      ensure(event.id, event.name, event.input, 'pending')
      continue
    }
    if (event.type === 'tool-result') {
      const rec = ensure(event.id, event.name, byId.get(event.id)?.input, 'completed')
      rec.output = event.result
      rec.status = 'completed'
      continue
    }
    if (event.type === 'tool-error') {
      const rec = ensure(
        event.id,
        event.name,
        byId.get(event.id)?.input,
        'error',
      )
      rec.error = event.message
      rec.status = 'error'
      continue
    }
    if (event.type === 'tool-output-denied') {
      const name =
        typeof event.payload.toolName === 'string'
          ? event.payload.toolName
          : byId.get(event.toolCallId)?.name ?? 'unknown'
      const rec = ensure(
        event.toolCallId,
        name,
        byId.get(event.toolCallId)?.input,
        'denied',
      )
      rec.status = 'denied'
    }
  }

  return order.map((id) => byId.get(id)!)
}

/** Ordered tool invocations from {@link Agent.stream} `steps` (multi-round tool loop). */
export function extractOrderedToolCallsFromAgentSteps(
  steps: unknown,
): LlmDebugToolCallRecord[] {
  if (!Array.isArray(steps)) return []

  const records: LlmDebugToolCallRecord[] = []
  let seq = 0

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    const s = step as Record<string, unknown>
    const calls = [
      ...asToolRows(s.toolCalls),
      ...asToolRows(s.staticToolCalls),
      ...asToolRows(s.dynamicToolCalls),
    ]
    const results = [
      ...asToolRows(s.toolResults),
      ...asToolRows(s.staticToolResults),
      ...asToolRows(s.dynamicToolResults),
    ]
    const resultsById = new Map<string, ToolRow>()
    for (const row of results) {
      const id = row.toolCallId?.trim()
      if (id) resultsById.set(id, row)
    }

    for (const call of calls) {
      const id = call.toolCallId?.trim() ?? `step-${seq + 1}`
      const result = id ? resultsById.get(id) : undefined
      seq += 1
      const output = result ? outputFromRow(result) : undefined
      const errorText =
        typeof result?.errorText === 'string'
          ? result.errorText
          : typeof result?.error === 'string'
            ? result.error
            : undefined
      records.push({
        order: seq,
        id,
        name: call.toolName?.trim() || 'unknown',
        input: call.input,
        output,
        error: errorText,
        status: errorText ? 'error' : output !== undefined ? 'completed' : 'pending',
      })
    }

    for (const result of results) {
      const id = result.toolCallId?.trim()
      if (!id || records.some((r) => r.id === id)) continue
      seq += 1
      const output = outputFromRow(result)
      const errorText =
        typeof result.errorText === 'string'
          ? result.errorText
          : typeof result.error === 'string'
            ? result.error
            : undefined
      records.push({
        order: seq,
        id,
        name: result.toolName?.trim() || 'unknown',
        input: result.input,
        output,
        error: errorText,
        status: errorText ? 'error' : output !== undefined ? 'completed' : 'pending',
      })
    }
  }

  return records
}

export function resolveToolCallsForAgentStream(params: {
  events?: readonly LlmEvent[]
  steps?: unknown
}): LlmDebugToolCallRecord[] {
  const fromEvents =
    params.events && params.events.length > 0
      ? extractOrderedToolCallsFromLlmEvents(params.events)
      : []
  if (fromEvents.length > 0) return fromEvents
  return extractOrderedToolCallsFromAgentSteps(params.steps)
}
