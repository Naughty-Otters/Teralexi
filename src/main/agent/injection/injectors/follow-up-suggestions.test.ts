import { describe, expect, it } from 'vitest'
import type { ModelMessage } from '@teralexi-ai'
import { buildInjectorUserMessage } from '../injector'
import { readInjectorMessageMeta } from '../injection-message-meta'
import {
  FOLLOW_UP_SUGGESTIONS_NUDGE_ID,
  followUpSuggestionsInjector,
  shouldInjectFollowUpSuggestionsNudge,
} from './follow-up-suggestions'

describe('follow-up-suggestions injector', () => {
  it('applies for every root toolLoop run', () => {
    expect(
      followUpSuggestionsInjector.applies({
        profile: { stage: 'toolLoop' },
        ctx: { agentRun: { meta: { depth: 0 } } },
        tools: [{ name: 'read_file' }],
      } as never),
    ).toBe(true)
    expect(
      followUpSuggestionsInjector.applies({
        profile: { stage: 'toolLoop' },
        ctx: { agentRun: { meta: { depth: 1 } } },
        tools: [],
      } as never),
    ).toBe(false)
    expect(
      followUpSuggestionsInjector.applies({
        profile: { stage: 'todoExecution' },
        ctx: { agentRun: { meta: { depth: 0 } } },
        tools: [],
      } as never),
    ).toBe(false)
  })

  it('injects a standing user message and does not provide system instructions', () => {
    expect(followUpSuggestionsInjector.injectInstructions).toBeUndefined()

    const userMsg = followUpSuggestionsInjector.injectUserMessage!({} as never)
    expect(userMsg?.role).toBe('user')
    expect(readInjectorMessageMeta(userMsg!)?.injectorId).toBe(
      'follow-up-suggestions',
    )
    expect(String((userMsg as { content?: unknown }).content)).toContain(
      'generate_follow_up',
    )
  })

  it('nudges once after a text-only final draft', async () => {
    const draft: ModelMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Here is the answer.' }],
    }
    expect(shouldInjectFollowUpSuggestionsNudge([draft])).toBe(true)

    const slice = await followUpSuggestionsInjector.onPrepareStep!(
      {
        profile: { stage: 'toolLoop' },
        ctx: { agentRun: { meta: { depth: 0 } }, opts: {} },
        tools: [],
        messages: [draft],
      } as never,
      { stepNumber: 1, messages: [draft], allToolNames: [] },
    )
    expect(slice?.messages).toHaveLength(2)
    expect(
      readInjectorMessageMeta(slice!.messages![1]!)?.injectorId,
    ).toBe(FOLLOW_UP_SUGGESTIONS_NUDGE_ID)
    expect(shouldInjectFollowUpSuggestionsNudge(slice!.messages!)).toBe(false)

    // Standing reminder must not block the nudge id.
    const withStanding = [
      draft,
      buildInjectorUserMessage('follow-up-suggestions', 'standing'),
    ]
    expect(shouldInjectFollowUpSuggestionsNudge(withStanding)).toBe(true)
  })

  it('skips nudge when the latest assistant turn already has tool calls', async () => {
    const withTools: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Working…' },
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'read_file',
            input: {},
          },
        ],
      } as ModelMessage,
    ]
    expect(shouldInjectFollowUpSuggestionsNudge(withTools)).toBe(false)

    const slice = await followUpSuggestionsInjector.onPrepareStep!(
      {
        profile: { stage: 'toolLoop' },
        ctx: { agentRun: { meta: { depth: 0 } }, opts: {} },
        tools: [],
        messages: withTools,
      } as never,
      { stepNumber: 1, messages: withTools, allToolNames: [] },
    )
    expect(slice).toBeUndefined()
  })

  it('does not nudge on step 0', async () => {
    const draft: ModelMessage = {
      role: 'assistant',
      content: 'answer',
    }
    const slice = await followUpSuggestionsInjector.onPrepareStep!(
      {
        profile: { stage: 'toolLoop' },
        ctx: { agentRun: { meta: { depth: 0 } }, opts: {} },
        tools: [],
        messages: [draft],
      } as never,
      { stepNumber: 0, messages: [draft], allToolNames: [] },
    )
    expect(slice).toBeUndefined()
  })
})
