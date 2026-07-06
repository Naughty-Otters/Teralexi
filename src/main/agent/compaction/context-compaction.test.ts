import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from '@teralexi-ai'
import {
  buildCompactionNote,
  compactConversationIfNeeded,
  estimateMessageChars,
  extractFileOps,
  findRecentRoundStart,
  splitMessagesForMessageBudget,
  serializeMessagesForSummary,
} from './context-compaction'

vi.mock('../expr/run-expression-llm', () => ({
  runExpressionLlmText: vi.fn(),
}))

import { runExpressionLlmText } from '../expr/run-expression-llm'

const userMsg = (text: string): ModelMessage => ({ role: 'user', content: text })
const assistantText = (text: string): ModelMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }] as never,
})
const toolCall = (toolName: string, input: Record<string, unknown>): ModelMessage => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolName, toolCallId: 'c1', input }] as never,
})
const toolResult = (
  toolName: string,
  output: unknown,
  role: 'assistant' | 'tool' = 'tool',
): ModelMessage => ({
  role,
  content: [
    {
      type: 'tool-result',
      toolName,
      toolCallId: 'c1',
      output,
    },
  ] as never,
})

describe('estimateMessageChars', () => {
  it('counts string and structured content', () => {
    expect(estimateMessageChars([userMsg('hello')])).toBe(5)
    expect(estimateMessageChars([assistantText('abc')])).toBe(3)
  })
})

describe('extractFileOps', () => {
  it('separates files read from files modified by tool name', () => {
    const ops = extractFileOps([
      toolCall('read_file', { path: 'src/a.ts' }),
      toolCall('grep_files', { path: 'src' }),
      toolCall('edit_file', { path: 'src/a.ts' }),
      toolCall('write_file', { path: 'src/b.ts' }),
      toolCall('move_file', { source: 'src/c.ts', destination: 'src/d.ts' }),
    ])
    expect(ops.readFiles.sort()).toEqual(['src', 'src/a.ts'])
    expect(ops.modifiedFiles).toContain('src/a.ts')
    expect(ops.modifiedFiles).toContain('src/b.ts')
    // move_file: destination is the modified location (matched before source)
    expect(ops.modifiedFiles).toContain('src/d.ts')
  })

  it('returns empty lists when there are no file tool calls', () => {
    expect(extractFileOps([userMsg('hi'), assistantText('ok')])).toEqual({
      readFiles: [],
      modifiedFiles: [],
    })
  })

  it('extracts paths from apply_patch patch_text', () => {
    const patch = [
      'Index: src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@',
      '+line',
      '',
      'Index: src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@',
      '+other',
    ].join('\n')
    const ops = extractFileOps([toolCall('apply_patch', { patch_text: patch })])
    expect(ops.modifiedFiles.sort()).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('extracts modified paths from tool-result file_change outputs', () => {
    const ops = extractFileOps([
      toolResult('edit_file', {
        resultType: 'file_change',
        written: true,
        files: [{ path: 'src/x.ts', diff: '+++ src/x.ts\n@@\n+1' }],
      }),
    ])
    expect(ops.modifiedFiles).toEqual(['src/x.ts'])
  })
})

describe('splitMessagesForMessageBudget', () => {
  it('reserves one slot for a compaction note', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => userMsg(`m${i}`))
    const split = splitMessagesForMessageBudget(msgs, 20)
    expect(split?.older).toHaveLength(6)
    expect(split?.recent).toHaveLength(19)
  })

  it('returns null when under budget', () => {
    expect(splitMessagesForMessageBudget([userMsg('a')], 20)).toBeNull()
  })
})

describe('findRecentRoundStart', () => {
  it('keeps the last N user-delimited rounds intact', () => {
    const msgs = [
      userMsg('u1'),
      assistantText('a1'),
      userMsg('u2'),
      assistantText('a2'),
      userMsg('u3'),
      assistantText('a3'),
    ]
    // preserve last 1 round → start at the last user message (index 4)
    expect(findRecentRoundStart(msgs, 1)).toBe(4)
    // preserve last 2 rounds → start at index 2
    expect(findRecentRoundStart(msgs, 2)).toBe(2)
    // preserve more rounds than exist → 0 (nothing to compact)
    expect(findRecentRoundStart(msgs, 5)).toBe(0)
  })
})

describe('serializeMessagesForSummary', () => {
  it('renders role + text and tool calls', () => {
    const out = serializeMessagesForSummary([
      userMsg('do it'),
      toolCall('read_file', { path: 'a.ts' }),
    ])
    expect(out).toContain('### user')
    expect(out).toContain('do it')
    expect(out).toContain('[tool-call read_file]')
    expect(out).toContain('a.ts')
  })
})

describe('buildCompactionNote', () => {
  it('includes summary and file-op lists', () => {
    const note = buildCompactionNote('did stuff', {
      readFiles: ['a.ts'],
      modifiedFiles: ['b.ts'],
    })
    expect(note).toContain('Compacted earlier context')
    expect(note).toContain('did stuff')
    expect(note).toContain('Files read earlier: a.ts')
    expect(note).toContain('Files modified earlier: b.ts')
  })
})

describe('compactConversationIfNeeded (no-LLM paths)', () => {
  const fakeCtx = {} as never

  beforeEach(() => {
    vi.mocked(runExpressionLlmText).mockReset()
  })

  it('returns unchanged when under budget', async () => {
    const msgs = [userMsg('small')]
    const result = await compactConversationIfNeeded(fakeCtx, msgs, { charBudget: 1000 })
    expect(result.compacted).toBe(false)
    expect(result.messages).toBe(msgs)
  })

  it('returns unchanged when there are not enough rounds to compact', async () => {
    const big = 'x'.repeat(2000)
    const msgs = [userMsg(big), assistantText(big)]
    // over budget, but only 1 round and we preserve 3 → nothing older to compact
    const result = await compactConversationIfNeeded(fakeCtx, msgs, {
      charBudget: 100,
      preserveRecentRounds: 3,
    })
    expect(result.compacted).toBe(false)
  })

  it('compacts older rounds when over budget and LLM returns a summary', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue('Earlier work summary')

    const msgs = [
      userMsg('round 1'),
      assistantText('a1'),
      toolCall('read_file', { path: 'src/old.ts' }),
      userMsg('round 2'),
      assistantText('a2'),
      userMsg('round 3'),
      assistantText('a3'),
    ]
    const bigTail = 'z'.repeat(2000)
    msgs[5] = userMsg(bigTail)
    msgs[6] = assistantText(bigTail)

    const result = await compactConversationIfNeeded(fakeCtx, msgs, {
      charBudget: 100,
      preserveRecentRounds: 1,
    })

    expect(result.compacted).toBe(true)
    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]?.role).toBe('user')
    expect(String(result.messages[0]?.content)).toContain('Compacted earlier context')
    expect(String(result.messages[0]?.content)).toContain('Earlier work summary')
    expect(String(result.messages[0]?.content)).toContain('Files read earlier: src/old.ts')
    expect(result.messages[1]).toEqual(msgs[5])
    expect(result.messages[2]).toEqual(msgs[6])
    expect(runExpressionLlmText).toHaveBeenCalledOnce()
  })

  it('compacts by message budget when history reaches capacity', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue('Earlier context summary')

    const msgs = Array.from({ length: 22 }, (_, i) =>
      i % 2 === 0 ? userMsg(`u${i}`) : assistantText(`a${i}`),
    )

    const result = await compactConversationIfNeeded(fakeCtx, msgs, {
      messageBudget: 20,
      forceCompact: true,
    })

    expect(result.compacted).toBe(true)
    expect(result.messages).toHaveLength(20)
    expect(String(result.messages[0]?.content)).toContain('Compacted earlier context')
    expect(result.messages[1]).toEqual(msgs[3])
  })
})
