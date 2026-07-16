import { describe, expect, it, beforeEach } from 'vitest'
import type { ModelMessage } from '@teralexi-ai'
import {
  DEEP_THINKING_AFTER_MARKER,
  DEEP_THINKING_BEFORE_MARKER,
  MULTIPLE_BRANCH_THINKING_MARKER,
  lastAssistantDraftIsTextOnly,
  shouldInjectMultipleBranchThinking,
  shouldInjectDeepThinkingAfterAnswer,
  shouldInjectDeepThinkingBeforeAnswer,
} from './deep-thinking-blocks'
import {
  clearDeepThinkingInjectionState,
  recordDeepThinkingBeforeInjection,
} from './deep-thinking-injection-state'
import { injectUserMessages, createPrepareStepFromInjectors } from './pipeline'
import { readInjectorMessageMeta } from './injection-message-meta'

function makeToolLoopCtx(overrides: Record<string, unknown> = {}) {
  return {
    opts: { conversationId: 'conv-deep', userId: 'user-1', skillId: 'general' },
    agentRun: { meta: { depth: 0 } },
    runtimeTools: [],
    sandbox: { getRoot: () => '/sandbox' },
    ...overrides,
  }
}

describe('deep thinking injectors', () => {
  beforeEach(() => {
    clearDeepThinkingInjectionState()
  })

  it('shouldInjectDeepThinkingBeforeAnswer is once per user turn', () => {
    expect(
      shouldInjectDeepThinkingBeforeAnswer([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-a',
        latestUserMessageId: 'user-1',
      }),
    ).toBe(true)

    recordDeepThinkingBeforeInjection('conv-a', {
      userMessageId: 'user-1',
      beforeInjectedAt: '2026-06-20T10:00:00.000Z',
    })

    expect(
      shouldInjectDeepThinkingBeforeAnswer([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-a',
        latestUserMessageId: 'user-1',
      }),
    ).toBe(false)

    expect(
      shouldInjectDeepThinkingBeforeAnswer(
        [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'follow up' },
        ],
        {
          conversationId: 'conv-a',
          latestUserMessageId: 'user-2',
        },
      ),
    ).toBe(true)
  })

  it('lastAssistantDraftIsTextOnly ignores tool-call turns', () => {
    const toolCallMessage: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: '1', toolName: 'read_file', args: {} },
      ],
    }
    expect(lastAssistantDraftIsTextOnly([toolCallMessage])).toBeNull()

    expect(
      lastAssistantDraftIsTextOnly([
        toolCallMessage,
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', result: 'ok' }] },
        { role: 'assistant', content: 'Here is the answer.' },
      ]),
    ).toBe('Here is the answer.')
  })

  it('shouldInjectDeepThinkingAfterAnswer when assistant drafted prose', () => {
    expect(
      shouldInjectDeepThinkingAfterAnswer(
        [
          { role: 'user', content: 'question' },
          { role: 'assistant', content: 'Draft answer' },
        ],
        { conversationId: 'conv-b', latestUserMessageId: 'user-1' },
      ),
    ).toBe(true)
  })

  it('shouldInjectMultipleBranchThinking is once per user turn', () => {
    expect(
      shouldInjectMultipleBranchThinking([{ role: 'user', content: 'hello' }], {
        conversationId: 'conv-mb',
        latestUserMessageId: 'user-1',
      }),
    ).toBe(true)
  })

  it('injects user messages in before → branch → datetime → follow-up order', async () => {
    const ctx = makeToolLoopCtx() as never
    const messages = await injectUserMessages(
      ctx,
      [{ role: 'user', content: 'What is 2+2?' }],
      0,
    )

    expect(messages).toHaveLength(5)
    expect(readInjectorMessageMeta(messages[1])?.injectorId).toBe(
      'deep-thinking-before-answer',
    )
    expect(readInjectorMessageMeta(messages[2])?.injectorId).toBe(
      'multiple-branch-thinking',
    )
    expect(readInjectorMessageMeta(messages[3])?.injectorId).toBe('current-datetime')
    expect(readInjectorMessageMeta(messages[4])?.injectorId).toBe(
      'follow-up-suggestions',
    )
    expect(String(messages[2].content)).toContain(MULTIPLE_BRANCH_THINKING_MARKER)
  })

  it('injects before-answer user message on each new turn', async () => {
    const ctx = makeToolLoopCtx() as never
    const messages = await injectUserMessages(
      ctx,
      [{ role: 'user', content: 'What is 2+2?' }],
      0,
    )

    expect(messages.length).toBeGreaterThanOrEqual(2)
    const beforeMessage = messages.find(
      (message) =>
        readInjectorMessageMeta(message)?.injectorId ===
        'deep-thinking-before-answer',
    )
    expect(beforeMessage).toBeDefined()
    expect(String(beforeMessage?.content)).toContain(DEEP_THINKING_BEFORE_MARKER)
    expect(readInjectorMessageMeta(beforeMessage!)).toMatchObject({
      injectorId: 'deep-thinking-before-answer',
    })
  })

  it('injects after-answer reminder on prepareStep after a text draft', async () => {
    const ctx = makeToolLoopCtx() as never
    const prepareStep = createPrepareStepFromInjectors(ctx, ['read_file'])
    expect(prepareStep).toBeTypeOf('function')

    const result = await prepareStep!({
      stepNumber: 1,
      messages: [
        { role: 'user', content: 'Explain otters' },
        { role: 'assistant', content: 'Otters are playful mammals.' },
      ],
      allToolNames: ['read_file'],
    })

    expect(result?.messages).toHaveLength(4)
    expect(String(result?.messages?.[2]?.content)).toContain(DEEP_THINKING_AFTER_MARKER)
    expect(readInjectorMessageMeta(result!.messages![2]!)).toMatchObject({
      injectorId: 'deep-thinking-after-answer',
    })
    expect(readInjectorMessageMeta(result!.messages![3]!)).toMatchObject({
      injectorId: 'follow-up-suggestions-nudge',
    })
  })
})
