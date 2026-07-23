/**
 * Regression locks for the Thinking / reasoning live-streaming display fix.
 *
 * Bug: Chat SDK mutates `reasoning.text` / step-progress `data` in place on the
 * same part object. Incremental sync reused those identities, so Vue skipped
 * re-renders until a full sync at turn end — the bubble showed a few chars,
 * then jumped to full text when the reply finished.
 *
 * Fix: clone message parts on every display sync; treat running Thinking
 * step-progress as in-flight; pin compact panes to the tail; namespace UI
 * flushes per conversation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import {
  assistantRowLooksInFlight,
  cloneMessageForDisplay,
  incrementalSyncChatMessages,
  normalizeChatMessagesForDisplay,
} from './components/chat/chatMessageNormalize'
import { compactPaneScrollTop } from './components/reasoningBubbleLayout'
import {
  flushAllUiForConversation,
  namespacedFlushKey,
  resetChatUiFlushState,
  scheduleUiFlush,
  setChatUiFlushSchedulers,
  setVisibleConversationForUiFlush,
} from './perf/scheduleUiFlush'

describe('live streaming display regression', () => {
  describe('cloneMessageForDisplay', () => {
    it('gives reasoning parts a new identity while copying current text', () => {
      const reasoning = {
        type: 'reasoning' as const,
        text: 'partial',
        state: 'streaming' as const,
      }
      const msg: UIMessage = {
        id: 'a1',
        role: 'assistant',
        parts: [reasoning],
      }
      const cloned = cloneMessageForDisplay(msg)
      expect(cloned).not.toBe(msg)
      expect(cloned.parts[0]).not.toBe(reasoning)
      expect(cloned.parts[0]).toMatchObject({
        type: 'reasoning',
        text: 'partial',
        state: 'streaming',
      })
    })

    it('gives step-progress parts a new identity (nested data still readable)', () => {
      const progress = {
        type: 'data-agent-step-progress' as const,
        id: 'thinking-1',
        data: {
          stepId: 'thinking',
          status: 'running',
          content: 'Analyzing',
        },
      }
      const msg: UIMessage = {
        id: 'a1',
        role: 'assistant',
        parts: [progress as UIMessage['parts'][number]],
      }
      const cloned = cloneMessageForDisplay(msg)
      expect(cloned.parts[0]).not.toBe(progress)
      expect(
        (cloned.parts[0] as { data?: { content?: string } }).data?.content,
      ).toBe('Analyzing')
    })
  })

  describe('assistantRowLooksInFlight', () => {
    it('is true while reasoning is streaming', () => {
      expect(
        assistantRowLooksInFlight({
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'reasoning', text: '…', state: 'streaming' }],
        }),
      ).toBe(true)
    })

    it('is true while Thinking step-progress is running', () => {
      expect(
        assistantRowLooksInFlight({
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'data-agent-step-progress',
              id: 't1',
              data: {
                stepId: 'thinking',
                status: 'running',
                content: '…',
              },
            } as UIMessage['parts'][number],
          ],
        }),
      ).toBe(true)
    })

    it('is false when reasoning is done and no other work is in flight', () => {
      expect(
        assistantRowLooksInFlight({
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'reasoning', text: 'done', state: 'done' }],
        }),
      ).toBe(false)
    })
  })

  describe('incrementalSyncChatMessages (Chat SDK in-place mutation)', () => {
    it('keeps reasoning text growing across many in-place delta syncs', () => {
      const reasoningPart = {
        type: 'reasoning' as const,
        text: '',
        state: 'streaming' as const,
      }
      const assistant: UIMessage = {
        id: 'a1',
        role: 'assistant',
        parts: [reasoningPart],
      }
      let prev = normalizeChatMessagesForDisplay([assistant])

      const tokens = [
        'The ',
        'user ',
        'wants ',
        'live ',
        'streaming ',
        'updates.',
      ]
      let accumulated = ''
      for (const token of tokens) {
        accumulated += token
        // Simulate AI SDK: mutate the live part, do not replace it.
        reasoningPart.text = accumulated

        const next = incrementalSyncChatMessages([assistant], prev)
        const part = next[0]?.parts[0]
        expect(part).not.toBe(prev[0]?.parts[0])
        expect(part).not.toBe(reasoningPart)
        expect(part?.type === 'reasoning' && part.text).toBe(accumulated)
        prev = next
      }

      expect(accumulated).toBe('The user wants live streaming updates.')
    })

    it('keeps Thinking step-progress content growing while status is running', () => {
      const progressPart = {
        type: 'data-agent-step-progress' as const,
        id: 'thinking-1',
        data: {
          stepId: 'thinking',
          title: 'Thinking',
          status: 'running',
          content: '',
          sequence: 1,
        },
      }
      const assistant: UIMessage = {
        id: 'a1',
        role: 'assistant',
        parts: [progressPart as UIMessage['parts'][number]],
      }
      let prev = normalizeChatMessagesForDisplay([assistant])

      for (const content of [
        '{"goal":"',
        '{"goal":"Fix',
        '{"goal":"Fix streaming"',
      ]) {
        progressPart.data.content = content
        const next = incrementalSyncChatMessages([assistant], prev)
        const part = next[0]?.parts[0] as {
          data?: { content?: string }
        }
        expect(next[0]?.parts[0]).not.toBe(prev[0]?.parts[0])
        expect(part.data?.content).toBe(content)
        prev = next
      }
    })

    it('still shows full reasoning text after the reply text part starts', () => {
      const fullReasoning = 'Complete reasoning before the answer'
      const reasoningPart = {
        type: 'reasoning' as const,
        text: fullReasoning,
        state: 'done' as const,
      }
      const prev = normalizeChatMessagesForDisplay([
        {
          id: 'a1',
          role: 'assistant',
          parts: [reasoningPart],
        },
      ])

      const withText: UIMessage = {
        id: 'a1',
        role: 'assistant',
        parts: [
          reasoningPart,
          { type: 'text', text: 'Answer starts…', state: 'streaming' },
        ],
      }

      const next = incrementalSyncChatMessages([withText], prev)
      const reasoning = next[0]?.parts.find((p) => p.type === 'reasoning')
      expect(reasoning).not.toBe(reasoningPart)
      expect(reasoning?.type === 'reasoning' && reasoning.text).toBe(
        fullReasoning,
      )
      expect(
        next[0]?.parts.some(
          (p) => p.type === 'text' && p.state === 'streaming',
        ),
      ).toBe(true)
    })
  })

  describe('compact reasoning pane', () => {
    it('pins scroll to the latest lines as content grows', () => {
      const viewport = 70
      expect(compactPaneScrollTop(40, viewport)).toBe(0)
      expect(compactPaneScrollTop(200, viewport)).toBe(130)
      expect(compactPaneScrollTop(500, viewport)).toBe(430)
    })
  })

  describe('per-conversation UI flush namespace', () => {
    beforeEach(() => {
      resetChatUiFlushState()
      setVisibleConversationForUiFlush('conv-visible')
      const rafQueue: FrameRequestCallback[] = []
      setChatUiFlushSchedulers({
        raf: (cb) => {
          rafQueue.push(cb)
          return rafQueue.length
        },
        microtask: (cb) => cb(),
      })
      ;(globalThis as { __flushRaf?: () => void }).__flushRaf = () => {
        const jobs = [...rafQueue]
        rafQueue.length = 0
        for (const job of jobs) job(0)
      }
    })

    afterEach(() => {
      resetChatUiFlushState()
      delete (globalThis as { __flushRaf?: () => void }).__flushRaf
    })

    it('does not let a background stream steal the visible messages-sync flush', () => {
      const visibleSync = vi.fn()
      const backgroundSync = vi.fn()

      scheduleUiFlush('messages-sync', visibleSync, {
        conversationId: 'conv-visible',
        priority: 'normal',
      })
      scheduleUiFlush('messages-sync', backgroundSync, {
        conversationId: 'conv-bg',
        priority: 'normal',
      })

      ;(globalThis as { __flushRaf?: () => void }).__flushRaf?.()

      expect(visibleSync).toHaveBeenCalledTimes(1)
      expect(backgroundSync).not.toHaveBeenCalled()
      expect(namespacedFlushKey('messages-sync', 'conv-visible')).not.toBe(
        namespacedFlushKey('messages-sync', 'conv-bg'),
      )

      flushAllUiForConversation('conv-bg')
      expect(backgroundSync).toHaveBeenCalledTimes(1)
    })
  })
})
