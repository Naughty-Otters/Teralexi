import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import {
  buildToolRunScopeIndex,
  isSubAgentToolPart,
  toolPartsForRun,
} from './toolRunScope'

function messageWithParts(parts: UIMessage['parts']): UIMessage {
  return { id: 'm1', role: 'assistant', parts }
}

describe('toolRunScope', () => {
  it('indexes companion data-tool-run-scope parts', () => {
    const message = messageWithParts([
      {
        type: 'data-tool-run-scope',
        id: 'tool-run-scope-tc1',
        data: {
          toolCallId: 'tc1',
          runId: 'child-1',
          parentRunId: 'root-1',
        },
      } as never,
      {
        type: 'tool-read_file',
        toolCallId: 'tc1',
        state: 'output-available',
        input: { path: 'a.ts' },
        output: { ok: true },
      } as never,
      {
        type: 'tool-read_file',
        toolCallId: 'tc2',
        state: 'output-available',
        input: { path: 'b.ts' },
        output: { ok: true },
      } as never,
    ])

    const index = buildToolRunScopeIndex(message)
    expect(index.get('tc1')).toEqual({
      runId: 'child-1',
      parentRunId: 'root-1',
    })
    expect(isSubAgentToolPart(message.parts[1], index)).toBe(true)
    expect(isSubAgentToolPart(message.parts[2], index)).toBe(false)
    expect(toolPartsForRun(message, 'child-1')).toHaveLength(1)
  })

  it('uses direct runId/parentRunId on the tool part when present', () => {
    const part = {
      type: 'tool-shell',
      toolCallId: 'tc9',
      runId: 'child-9',
      parentRunId: 'root-9',
      state: 'output-available',
      input: { command: 'rg foo' },
      output: 'ok',
    }
    const index = new Map()
    expect(isSubAgentToolPart(part, index)).toBe(true)
  })
})
