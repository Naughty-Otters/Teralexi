import { describe, expect, it } from 'vitest'
import {
  applyToolOutputTruncation,
  buildReadFilePrunedSummary,
  pruneOldToolResultsFromMessages,
  DEFAULT_TOOL_OUTPUT_CHAR_CAP,
  DEFAULT_MESSAGE_CHAR_BUDGET,
  DEFAULT_PRESERVE_RECENT_ROUNDS,
  READ_FILE_PRUNE_PREVIEW_CHARS,
} from './context-overflow-guard'
import type { ModelMessage } from '@teralexi-ai'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeToolSet(executeFn: (input: unknown) => Promise<unknown>) {
  return {
    my_tool: {
      execute: executeFn,
      description: 'test tool',
    },
  }
}

function userMsg(content: string): ModelMessage {
  return { role: 'user', content }
}

function assistantWithToolCall(toolCallId: string, toolName: string): ModelMessage {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId, toolName, input: {} }],
  }
}

function toolResultMsg(
  toolCallId: string,
  toolName: string,
  output: unknown,
  input?: Record<string, unknown>,
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        ...(input ? { input } : {}),
        output: typeof output === 'string'
          ? { type: 'text', value: output }
          : { type: 'json', value: output },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// applyToolOutputTruncation
// ---------------------------------------------------------------------------

describe('applyToolOutputTruncation', () => {
  it('passes through short string results unchanged', async () => {
    const toolSet = makeToolSet(async () => 'short output')
    applyToolOutputTruncation(toolSet, 100)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({})
    expect(result).toBe('short output')
  })

  it('truncates long string results and appends notice', async () => {
    const longOutput = 'x'.repeat(200)
    const toolSet = makeToolSet(async () => longOutput)
    applyToolOutputTruncation(toolSet, 100)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({})
    expect(typeof result).toBe('string')
    const s = result as string
    expect(s.startsWith('x'.repeat(100))).toBe(true)
    expect(s).toContain('truncated')
    expect(s).toContain('100 chars removed') // 200 - 100 = 100 chars removed
    expect(s.length).toBeGreaterThan(100)
    expect(s.length).toBeLessThan(300) // truncated + notice, not the full 200
  })

  it('truncates large string fields in object results', async () => {
    const big = 'a'.repeat(500)
    const toolSet = makeToolSet(async () => ({ stdout: big, exit_code: 0 }))
    applyToolOutputTruncation(toolSet, 100)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({}) as Record<string, unknown>
    expect(typeof result.stdout).toBe('string')
    expect((result.stdout as string).length).toBeLessThan(500)
    expect((result.stdout as string)).toContain('truncated')
    expect(result.exit_code).toBe(0) // non-string fields untouched
  })

  it('leaves object results with small fields unchanged', async () => {
    const obj = { success: true, data: 'small' }
    const toolSet = makeToolSet(async () => obj)
    applyToolOutputTruncation(toolSet, 100)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({})
    expect(result).toEqual(obj)
  })

  it('does not affect null/undefined results', async () => {
    const toolSet = makeToolSet(async () => null)
    applyToolOutputTruncation(toolSet, 100)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({})
    expect(result).toBeNull()
  })

  it('does not affect numeric results', async () => {
    const toolSet = makeToolSet(async () => 42)
    applyToolOutputTruncation(toolSet, 100)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({})
    expect(result).toBe(42)
  })

  it('uses DEFAULT_TOOL_OUTPUT_CHAR_CAP when no limit provided', async () => {
    const longOutput = 'y'.repeat(DEFAULT_TOOL_OUTPUT_CHAR_CAP + 100)
    const toolSet = makeToolSet(async () => longOutput)
    applyToolOutputTruncation(toolSet)
    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({}) as string
    expect(result.startsWith('y'.repeat(DEFAULT_TOOL_OUTPUT_CHAR_CAP))).toBe(true)
    expect(result).toContain('truncated')
  })

  it('skips tools without an execute function', () => {
    const toolSet = {
      no_exec: { description: 'no execute', inputSchema: {} },
    } as Record<string, unknown>
    // Should not throw
    expect(() => applyToolOutputTruncation(toolSet, 100)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// pruneOldToolResultsFromMessages — no pruning needed
// ---------------------------------------------------------------------------

describe('pruneOldToolResultsFromMessages — under budget', () => {
  it('returns messages unchanged when under budget', () => {
    const msgs: ModelMessage[] = [userMsg('hello'), assistantWithToolCall('tc1', 'my_tool')]
    const { messages, pruned } = pruneOldToolResultsFromMessages(msgs, { charBudget: 1_000_000 })
    expect(messages).toBe(msgs) // same reference
    expect(pruned).toBe(0)
  })

  it('returns unchanged when no tool result messages exist', () => {
    const msgs: ModelMessage[] = [userMsg('hello'), { role: 'assistant', content: 'reply' }]
    const { messages, pruned } = pruneOldToolResultsFromMessages(msgs, { charBudget: 0 })
    expect(messages).toBe(msgs)
    expect(pruned).toBe(0)
  })

  it('returns unchanged when all tool results are within preserveRecentRounds', () => {
    const msgs: ModelMessage[] = [
      userMsg('go'),
      assistantWithToolCall('tc1', 'tool_a'),
      toolResultMsg('tc1', 'tool_a', 'result1'),
    ]
    // Only 1 tool result, preserveRecentRounds=3 → nothing to summarise
    const { messages, pruned } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 0,
      preserveRecentRounds: 3,
    })
    expect(pruned).toBe(0)
    expect(messages).toBe(msgs)
  })
})

// ---------------------------------------------------------------------------
// pruneOldToolResultsFromMessages — pruning applied
// ---------------------------------------------------------------------------

describe('pruneOldToolResultsFromMessages — over budget', () => {
  function buildManyRounds(n: number, outputSize: number): ModelMessage[] {
    const msgs: ModelMessage[] = [userMsg('start')]
    for (let i = 0; i < n; i++) {
      msgs.push(assistantWithToolCall(`tc${i}`, 'read_file'))
      msgs.push(toolResultMsg(`tc${i}`, 'read_file', 'x'.repeat(outputSize)))
    }
    return msgs
  }

  it('summarises old rounds when over budget', () => {
    const msgs = buildManyRounds(5, 10_000) // 5 * 10K = 50K chars of results
    const { messages, pruned, charsBefore, charsAfter } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 1_000, // force pruning
      preserveRecentRounds: 2,
    })

    // 5 tool msgs, preserve last 2 → summarise first 3
    expect(pruned).toBe(3)
    expect(charsAfter).toBeLessThan(charsBefore)

    // Last 2 tool result messages should be intact (full 'x'.repeat(10_000))
    const toolMsgs = messages.filter((m) => m.role === 'tool')
    const lastTwo = toolMsgs.slice(-2)
    for (const tm of lastTwo) {
      const output = ((tm as { content: Array<{ output: { value: string } }> }).content[0].output)
      expect(output.value).toBe('x'.repeat(10_000))
    }

    // Earlier tool messages should be summarised (compact vs full 10K payload)
    const firstThree = toolMsgs.slice(0, 3)
    for (const tm of firstThree) {
      const output = ((tm as { content: Array<{ output: { type: string; value: string } }> }).content[0].output)
      expect(output.type).toBe('text')
      expect(output.value).toContain('full content pruned')
      expect(output.value.length).toBeLessThan(READ_FILE_PRUNE_PREVIEW_CHARS + 80)
    }
  })

  it('preserves user and assistant messages unchanged', () => {
    const msgs = buildManyRounds(4, 5_000)
    const { messages } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 1_000,
      preserveRecentRounds: 1,
    })
    const userMsgs = messages.filter((m) => m.role === 'user')
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')
    expect(userMsgs[0]).toBe(msgs[0]) // unchanged reference
    for (const am of assistantMsgs) {
      const orig = msgs.find((m) => m === am)
      expect(orig).toBeDefined() // assistant messages not touched
    }
  })

  it('summary preserves read_file path and content preview for text output', () => {
    const msgs: ModelMessage[] = [
      userMsg('go'),
      assistantWithToolCall('tc1', 'read_file'),
      toolResultMsg(
        'tc1',
        'read_file',
        'export const answer = 42\n',
        { path: 'src/a.ts' },
      ),
      assistantWithToolCall('tc2', 'read_file'),
      toolResultMsg('tc2', 'read_file', 'recent content'),
    ]
    const { messages } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 0,
      preserveRecentRounds: 1,
    })
    const firstToolMsg = messages.filter((m) => m.role === 'tool')[0] as {
      content: Array<{ output: { value: string } }>
    }
    const summary = firstToolMsg.content[0].output.value
    expect(summary).toContain('read_file: src/a.ts')
    expect(summary).toContain('export const answer = 42')
    expect(summary).toContain('(full content pruned)')
  })

  it('summary preserves read_file path and content preview for json output', () => {
    const fileBody = 'function main() {\n' + '  return 1\n'.repeat(200) + '}'
    const msgs: ModelMessage[] = [
      userMsg('go'),
      assistantWithToolCall('tc1', 'read_file'),
      toolResultMsg('tc1', 'read_file', {
        path: 'src/main.ts',
        content: fileBody,
        encoding: 'utf8',
      }),
      assistantWithToolCall('tc2', 'read_file'),
      toolResultMsg('tc2', 'read_file', { path: 'src/recent.ts', content: 'ok' }),
    ]
    const { messages } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 0,
      preserveRecentRounds: 1,
    })
    const summary = (
      messages.filter((m) => m.role === 'tool')[0] as {
        content: Array<{ output: { value: string } }>
      }
    ).content[0].output.value
    expect(summary).toContain('read_file: src/main.ts')
    expect(summary).toContain(fileBody.slice(0, READ_FILE_PRUNE_PREVIEW_CHARS))
    expect(summary).toContain('(full content pruned)')
    expect(summary.length).toBeLessThan(fileBody.length)
  })

  it('summary handles json output with exit_code', () => {
    const msgs: ModelMessage[] = [
      userMsg('run it'),
      assistantWithToolCall('tc1', 'run_script'),
      {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: 'tc1',
          toolName: 'run_script',
          output: { type: 'json', value: { exit_code: 0, stdout: 'output here', stderr: '' } },
        }],
      },
      assistantWithToolCall('tc2', 'run_script'),
      toolResultMsg('tc2', 'run_script', { exit_code: 0, stdout: 'recent' }),
    ]
    const { messages } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 0,
      preserveRecentRounds: 1,
    })
    const toolMsgs = messages.filter((m) => m.role === 'tool')
    const summary = (toolMsgs[0] as { content: Array<{ output: { value: string } }> })
      .content[0].output.value
    expect(summary).toContain('run_script')
    expect(summary).toContain('exit_code=0')
    expect(summary).toContain('pruned')
  })

  it('uses defaults when no opts provided', () => {
    // Build messages just over the default budget
    const msgs = buildManyRounds(
      DEFAULT_PRESERVE_RECENT_ROUNDS + 2,
      Math.ceil(DEFAULT_MESSAGE_CHAR_BUDGET / (DEFAULT_PRESERVE_RECENT_ROUNDS + 2)) + 100,
    )
    const { pruned } = pruneOldToolResultsFromMessages(msgs)
    // Should have summarised at least 1 round (the oldest)
    expect(pruned).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// charsBefore / charsAfter reporting
// ---------------------------------------------------------------------------

describe('pruneOldToolResultsFromMessages — thread-aware', () => {
  it('prunes auth-like tool output under the active testing thread', () => {
    const msgs: ModelMessage[] = [
      userMsg('fix vitest mocks'),
      assistantWithToolCall('tc1', 'read_file'),
      toolResultMsg(
        'tc1',
        'read_file',
        'Error: JWT token invalid at login/session/oauth handler',
      ),
      assistantWithToolCall('tc2', 'read_file'),
      toolResultMsg('tc2', 'read_file', 'recent test output'),
    ]
    const { messages, pruned } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 0,
      preserveRecentRounds: 1,
      currentThreadTag: 'testing',
    })
    expect(pruned).toBe(1)
    const firstTool = messages.filter((m) => m.role === 'tool')[0] as {
      content: Array<{ output: { value: string } }>
    }
    expect(firstTool.content[0].output.value).toContain('pruned')
    const lastTool = messages.filter((m) => m.role === 'tool').at(-1) as {
      content: Array<{ output: { value: string } }>
    }
    expect(lastTool.content[0].output.value).toBe('recent test output')
  })
})

describe('buildReadFilePrunedSummary', () => {
  it('formats directory listings with path', () => {
    const summary = buildReadFilePrunedSummary({
      path: 'src/components',
      isDirectory: true,
      entries: ['a.tsx', 'b.tsx'],
    })
    expect(summary).toBe(
      'read_file: src/components (directory, 2 entries) (full content pruned)',
    )
  })
})

describe('pruneOldToolResultsFromMessages — reporting', () => {
  it('reports charsBefore and charsAfter accurately', () => {
    const msgs: ModelMessage[] = [
      userMsg('hi'),
      assistantWithToolCall('tc1', 'tool_a'),
      toolResultMsg('tc1', 'tool_a', 'x'.repeat(5_000)),
      assistantWithToolCall('tc2', 'tool_a'),
      toolResultMsg('tc2', 'tool_a', 'y'.repeat(5_000)),
    ]
    const { charsBefore, charsAfter, pruned } = pruneOldToolResultsFromMessages(msgs, {
      charBudget: 0,
      preserveRecentRounds: 1,
    })
    expect(pruned).toBe(1)
    expect(charsBefore).toBeGreaterThan(9_000)
    expect(charsAfter).toBeLessThan(charsBefore)
  })
})
