import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@openfde-ai'
import {
  AGENTIC_RUN_CONVERSATION_SECTION_IDS,
  conversationSectionExpandedByDefault,
  filterVisibleConversationBubbles,
  isPrimaryReplyConversationSection,
  isTextResponseConversationSection,
  messageFinalTextStarted,
  THINKING_CONVERSATION_SECTION_IDS,
} from './conversationBubbleDisplay'
import type { StructuredDebugSection } from './structuredDebugViewModel'

function assistant(parts: UIMessage['parts']): UIMessage {
  return { id: 'a1', role: 'assistant', parts }
}

describe('messageFinalTextStarted', () => {
  it('is false during reasoning-only turns', () => {
    expect(
      messageFinalTextStarted(
        assistant([
          { type: 'reasoning', text: 'hmm', state: 'streaming' },
        ]),
      ),
    ).toBe(false)
  })

  it('is false while structured pipeline text is still streaming', () => {
    expect(
      messageFinalTextStarted(
        assistant([
          {
            type: 'text',
            text: JSON.stringify({
              version: 2,
              assistantContent: {
                outer: {
                  finalResult: '**Thinking**\n\nStill planning…',
                  report: '',
                  streamingText: '',
                },
                subSteps: [],
              },
            }),
            state: 'streaming',
          },
        ]),
      ),
    ).toBe(false)
  })

  it('is true when assistant plain text is streaming', () => {
    expect(
      messageFinalTextStarted(
        assistant([{ type: 'text', text: 'Hello', state: 'streaming' }]),
      ),
    ).toBe(true)
  })

  it('is false when summary step progress has started but is still empty', () => {
    expect(
      messageFinalTextStarted(
        assistant([
          {
            type: 'data-agent-step-progress',
            id: 'summary-1',
            data: {
              stepId: 'summary',
              title: 'Summary',
              status: 'running',
              content: '',
            },
          },
        ]),
      ),
    ).toBe(false)
  })

  it('is true when summary step progress has content', () => {
    expect(
      messageFinalTextStarted(
        assistant([
          {
            type: 'data-agent-step-progress',
            id: 'summary-1',
            data: {
              stepId: 'summary',
              title: 'Summary',
              status: 'running',
              content: 'Here is the answer.',
            },
          },
        ]),
      ),
    ).toBe(true)
  })

  it('is true for plain completed assistant text', () => {
    expect(
      messageFinalTextStarted(
        assistant([{ type: 'text', text: 'Done.', state: 'done' }]),
      ),
    ).toBe(true)
  })
})

describe('filterVisibleConversationBubbles', () => {
  const sections: StructuredDebugSection[] = [
    {
      id: 'ThinkingStep',
      title: 'Thinking',
      bodyHtml: '<p>t</p>',
      status: 'done',
    },
    {
      id: 'SkillsToolExecutionStep',
      title: 'Agentic Run',
      bodyHtml: '<p>run</p>',
      status: 'done',
    },
    {
      id: 'SummaryStep',
      title: 'Summary',
      bodyHtml: '<p>answer</p>',
      status: 'done',
    },
    {
      id: 'finalResult',
      title: 'Final Result',
      bodyHtml: '<p>deliverable</p>',
      status: 'done',
    },
  ]

  it('hides thinking and agentic run once final text started', () => {
    const visible = filterVisibleConversationBubbles(sections, {
      finalTextStarted: true,
      showAgenticRunBubbles: true,
    })
    expect(visible.some((s) => THINKING_CONVERSATION_SECTION_IDS.has(s.id))).toBe(
      false,
    )
    expect(
      visible.some((s) => AGENTIC_RUN_CONVERSATION_SECTION_IDS.has(s.id)),
    ).toBe(false)
    expect(visible.some((s) => s.id === 'SummaryStep')).toBe(true)
  })

  it('hides agentic run sections when disabled', () => {
    const visible = filterVisibleConversationBubbles(sections, {
      showAgenticRunBubbles: false,
    })
    expect(
      visible.some((s) => AGENTIC_RUN_CONVERSATION_SECTION_IDS.has(s.id)),
    ).toBe(false)
    expect(visible.some((s) => s.id === 'ThinkingStep')).toBe(true)
  })

  it('still omits report deliverables', () => {
    const visible = filterVisibleConversationBubbles(sections)
    expect(visible.some((s) => s.id === 'finalResult')).toBe(false)
  })

  it('falls back when filters would hide every section', () => {
    const onlyThinking: StructuredDebugSection[] = [
      {
        id: 'ThinkingStep',
        title: 'Thinking',
        bodyHtml: '<p>t</p>',
        status: 'running',
      },
    ]
    const visible = filterVisibleConversationBubbles(onlyThinking, {
      finalTextStarted: true,
      showAgenticRunBubbles: false,
    })
    expect(visible).toHaveLength(1)
    expect(visible[0]?.id).toBe('ThinkingStep')
  })
})

describe('isTextResponseConversationSection', () => {
  it('matches summary section ids and titles case-insensitively', () => {
    expect(isTextResponseConversationSection({ id: 'SummaryStep', title: 'Summary' })).toBe(
      true,
    )
    expect(isTextResponseConversationSection({ id: 'summary', title: 'Summary' })).toBe(
      true,
    )
    expect(isTextResponseConversationSection({ id: 'step-4', title: 'Summary' })).toBe(
      true,
    )
    expect(isTextResponseConversationSection({ id: 'summary-1', title: 'Step' })).toBe(
      true,
    )
    expect(isTextResponseConversationSection({ id: 'ThinkingStep', title: 'Thinking' })).toBe(
      false,
    )
  })

  it('defaults text response sections to expanded', () => {
    expect(conversationSectionExpandedByDefault({ id: 'SummaryStep' })).toBe(true)
    expect(conversationSectionExpandedByDefault({ id: 'SearchStep' })).toBe(true)
    expect(conversationSectionExpandedByDefault({ id: 'ThinkingStep' })).toBe(
      false,
    )
    expect(
      conversationSectionExpandedByDefault({ id: 'SkillsToolExecutionStep' }),
    ).toBe(false)
    expect(conversationSectionExpandedByDefault({ id: 'PlanningStep' })).toBe(
      false,
    )
    expect(
      conversationSectionExpandedByDefault(
        { id: 'SearchStep' },
        { isPrimaryReply: true },
      ),
    ).toBe(true)
  })

  it('treats the last content bubble as the primary reply', () => {
    const sections = [
      { id: 'ThinkingStep', title: 'Thinking', bodyHtml: 'hmm', bodyMarkdown: 'hmm' },
      { id: 'SummaryStep', title: 'Summary', bodyHtml: 'answer', bodyMarkdown: 'answer' },
    ]
    expect(isPrimaryReplyConversationSection(sections, 0)).toBe(false)
    expect(isPrimaryReplyConversationSection(sections, 1)).toBe(true)
  })
})
