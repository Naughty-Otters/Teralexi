import { describe, expect, it } from 'vitest'
import {
  buildToolRunScopeChunk,
  extractToolCallId,
  isToolUiChunkType,
  stampToolUiChunkWithRunScope,
  TOOL_RUN_SCOPE_PART_TYPE,
} from './tool-run-scope'

describe('tool-run-scope', () => {
  it('detects tool UI chunk types', () => {
    expect(isToolUiChunkType('tool-input-available')).toBe(true)
    expect(isToolUiChunkType('tool-read_file')).toBe(true)
    expect(isToolUiChunkType('tool-approval-request')).toBe(true)
    expect(isToolUiChunkType('text-delta')).toBe(false)
    expect(isToolUiChunkType('data-sub-agent-run')).toBe(false)
  })

  it('extracts toolCallId from chunks and parts', () => {
    expect(extractToolCallId({ toolCallId: 'tc-1' })).toBe('tc-1')
    expect(
      extractToolCallId({ toolCall: { toolCallId: ' nested ' } }),
    ).toBe('nested')
    expect(extractToolCallId({ type: 'tool-read_file' })).toBe('')
  })

  it('stamps run scope onto tool chunks', () => {
    const stamped = stampToolUiChunkWithRunScope(
      { type: 'tool-input-available', toolCallId: 'tc-1' },
      { runId: 'child-1', parentRunId: 'root-1' },
    )
    expect(stamped).toEqual({
      type: 'tool-input-available',
      toolCallId: 'tc-1',
      runId: 'child-1',
      parentRunId: 'root-1',
    })
  })

  it('builds companion data-tool-run-scope chunks', () => {
    const chunk = buildToolRunScopeChunk({
      toolCallId: 'tc-9',
      runId: 'child-9',
      parentRunId: 'root-9',
    })
    expect(chunk.type).toBe(TOOL_RUN_SCOPE_PART_TYPE)
    expect(chunk.data).toEqual({
      toolCallId: 'tc-9',
      runId: 'child-9',
      parentRunId: 'root-9',
    })
  })
})
