import { describe, expect, it } from 'vitest'
import type { LlmEvent } from './events'
import {
  extractOrderedToolCallsFromAgentSteps,
  extractOrderedToolCallsFromLlmEvents,
} from './llm-debug-tool-calls'

describe('extractOrderedToolCallsFromLlmEvents', () => {
  it('pairs tool-call with tool-result in order', () => {
    const events: LlmEvent[] = [
      { type: 'tool-call', id: 'c1', name: 'read_file', input: { path: 'a.ts' } },
      { type: 'tool-call', id: 'c2', name: 'grep_files', input: { q: 'foo' } },
      { type: 'tool-result', id: 'c1', name: 'read_file', result: 'file body' },
      { type: 'tool-error', id: 'c2', name: 'grep_files', message: 'not found' },
    ]
    const rows = extractOrderedToolCallsFromLlmEvents(events)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      order: 1,
      id: 'c1',
      name: 'read_file',
      input: { path: 'a.ts' },
      output: 'file body',
      status: 'completed',
    })
    expect(rows[1]).toMatchObject({
      order: 2,
      id: 'c2',
      status: 'error',
      error: 'not found',
    })
  })

  it('records denied tool output', () => {
    const rows = extractOrderedToolCallsFromLlmEvents([
      { type: 'tool-call', id: 'c1', name: 'run_script', input: {} },
      {
        type: 'tool-output-denied',
        toolCallId: 'c1',
        payload: { type: 'tool-output-denied', toolCallId: 'c1' },
      },
    ])
    expect(rows[0]?.status).toBe('denied')
  })
})

describe('extractOrderedToolCallsFromAgentSteps', () => {
  it('extracts calls and results across steps', () => {
    const rows = extractOrderedToolCallsFromAgentSteps([
      {
        toolCalls: [
          { toolCallId: 'a', toolName: 'read_file', input: { path: 'x' } },
        ],
        toolResults: [{ toolCallId: 'a', output: { ok: true } }],
      },
      {
        staticToolCalls: [
          { toolCallId: 'b', toolName: 'write_file', input: { path: 'y' } },
        ],
        staticToolResults: [
          { toolCallId: 'b', output: { written: true } },
        ],
      },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.output).toEqual({ ok: true })
    expect(rows[1]?.name).toBe('write_file')
  })
})
