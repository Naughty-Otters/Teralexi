import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ModelMessage } from '@teralexi-ai'
import {
  applyMidLoopBudget,
  getMidLoopBudgetState,
  recoverFromContextOverflow,
  resetMidLoopBudgetStateForTests,
  resetOverflowRecoveryForStream,
  MID_LOOP_COMPACT_COOLDOWN_STEPS,
} from './mid-loop-budget'
import { DEFAULT_MESSAGE_CHAR_BUDGET } from './context-overflow-guard'
import { estimateMessageChars } from '../compaction'

const compactConversationIfNeeded = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, messages: ModelMessage[]) => ({
    messages,
    compacted: false,
  })),
)

vi.mock('../compaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../compaction')>()
  return {
    ...actual,
    compactConversationIfNeeded,
  }
})

function toolResult(id: string, text: string): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: id,
        toolName: 'read_file',
        output: { type: 'text', value: text },
      },
    ],
  } as ModelMessage
}

function assistantToolCall(id: string): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: id,
        toolName: 'read_file',
        input: { path: 'a.ts' },
      },
    ],
  } as ModelMessage
}

function user(text: string): ModelMessage {
  return { role: 'user', content: text }
}

function makeCtx() {
  const agentFlow = {}
  return {
    agentFlow,
  } as never
}

describe('applyMidLoopBudget', () => {
  beforeEach(() => {
    compactConversationIfNeeded.mockClear()
    compactConversationIfNeeded.mockImplementation(
      async (_ctx: unknown, messages: ModelMessage[]) => ({
        messages,
        compacted: false,
      }),
    )
  })

  it('no-ops on step 0', async () => {
    const big = 'x'.repeat(DEFAULT_MESSAGE_CHAR_BUDGET + 1000)
    const msgs = [user('hi'), assistantToolCall('1'), toolResult('1', big)]
    const out = await applyMidLoopBudget(msgs, { stepNumber: 0 })
    expect(out.pruned).toBe(0)
    expect(out.messages).toBe(msgs)
  })

  it('skips incomplete tool rounds', async () => {
    const big = 'x'.repeat(DEFAULT_MESSAGE_CHAR_BUDGET + 1000)
    // Unanswered tool-call (no matching tool result)
    const msgs = [
      user('hi'),
      assistantToolCall('pending'),
      toolResult('other', big),
    ]
    const out = await applyMidLoopBudget(msgs, { stepNumber: 2 })
    expect(out.skippedIncompleteRound).toBe(true)
    expect(out.pruned).toBe(0)
  })

  it('prunes old tool results when over budget without LLM when compact disabled', async () => {
    const chunk = 'y'.repeat(40_000)
    const msgs: ModelMessage[] = [user('start')]
    for (let i = 0; i < 6; i++) {
      msgs.push(assistantToolCall(`c${i}`), toolResult(`c${i}`, chunk))
    }
    const out = await applyMidLoopBudget(msgs, {
      stepNumber: 2,
      allowLlmCompact: false,
      charBudget: 100_000,
    })
    expect(out.pruned).toBeGreaterThan(0)
    expect(out.compacted).toBe(false)
    expect(compactConversationIfNeeded).not.toHaveBeenCalled()
    expect(out.charsAfter).toBeLessThan(out.charsBefore)
  })

  it('escalates to LLM compact when prune is not enough', async () => {
    const chunk = 'z'.repeat(80_000)
    const msgs: ModelMessage[] = [
      user('start'),
      assistantToolCall('a'),
      toolResult('a', chunk),
      assistantToolCall('b'),
      toolResult('b', chunk),
      user('continue'),
    ]
    compactConversationIfNeeded.mockImplementation(
      async (_ctx: unknown, messages: ModelMessage[]) => ({
        messages: [user('COMPACTED'), ...messages.slice(-2)],
        compacted: true,
      }),
    )
    const ctx = makeCtx()
    resetMidLoopBudgetStateForTests(ctx)
    const out = await applyMidLoopBudget(msgs, {
      stepNumber: 3,
      charBudget: 50_000,
      allowLlmCompact: true,
      ctx,
    })
    expect(out.compacted).toBe(true)
    expect(compactConversationIfNeeded).toHaveBeenCalled()
  })

  it('respects compact cooldown', async () => {
    const chunk = 'z'.repeat(80_000)
    const msgs: ModelMessage[] = [
      user('start'),
      assistantToolCall('a'),
      toolResult('a', chunk),
      user('continue'),
    ]
    compactConversationIfNeeded.mockImplementation(
      async (_ctx: unknown, messages: ModelMessage[]) => ({
        messages: [user('COMPACTED'), ...messages.slice(-1)],
        compacted: true,
      }),
    )
    const ctx = makeCtx()
    resetMidLoopBudgetStateForTests(ctx)

    await applyMidLoopBudget(msgs, {
      stepNumber: 3,
      charBudget: 10_000,
      ctx,
    })
    compactConversationIfNeeded.mockClear()

    const second = await applyMidLoopBudget(msgs, {
      stepNumber: 3 + MID_LOOP_COMPACT_COOLDOWN_STEPS - 1,
      charBudget: 10_000,
      ctx,
    })
    expect(second.compacted).toBe(false)
    expect(compactConversationIfNeeded).not.toHaveBeenCalled()
  })
})

describe('recoverFromContextOverflow', () => {
  beforeEach(() => {
    compactConversationIfNeeded.mockClear()
    compactConversationIfNeeded.mockImplementation(
      async (_ctx: unknown, messages: ModelMessage[]) => ({
        messages: [user('recovered'), ...messages.slice(-1)],
        compacted: true,
      }),
    )
  })

  it('compacts once then refuses a second recovery', async () => {
    const ctx = makeCtx()
    resetMidLoopBudgetStateForTests(ctx)
    const msgs = [user('a'), toolResult('1', 'x'.repeat(1000))]

    const first = await recoverFromContextOverflow(ctx, msgs)
    expect(first).not.toBeNull()
    expect(compactConversationIfNeeded).toHaveBeenCalled()

    const second = await recoverFromContextOverflow(ctx, msgs)
    expect(second).toBeNull()
  })

  it('prefers remembered mid-loop transcript over short initial messages', async () => {
    const ctx = makeCtx()
    resetMidLoopBudgetStateForTests(ctx)
    const initial = [user('start')]
    const midLoop: ModelMessage[] = [
      user('start'),
      assistantToolCall('a'),
      toolResult('a', 'y'.repeat(50_000)),
      user('continue'),
    ]
    const state = getMidLoopBudgetState(ctx)
    state.lastPrepareStepMessages = midLoop

    compactConversationIfNeeded.mockImplementation(
      async (_ctx: unknown, messages: ModelMessage[]) => {
        // Assert recovery received the richer mid-loop transcript.
        expect(estimateMessageChars(messages)).toBeGreaterThan(
          estimateMessageChars(initial),
        )
        return { messages: [user('ok')], compacted: true }
      },
    )

    const out = await recoverFromContextOverflow(ctx, initial)
    expect(out).not.toBeNull()
  })

  it('allows a new recovery after resetOverflowRecoveryForStream', async () => {
    const ctx = makeCtx()
    resetMidLoopBudgetStateForTests(ctx)
    await recoverFromContextOverflow(ctx, [user('a')])
    expect(await recoverFromContextOverflow(ctx, [user('b')])).toBeNull()
    resetOverflowRecoveryForStream(ctx)
    compactConversationIfNeeded.mockClear()
    const again = await recoverFromContextOverflow(ctx, [user('c')])
    expect(again).not.toBeNull()
    expect(compactConversationIfNeeded).toHaveBeenCalled()
  })
})
