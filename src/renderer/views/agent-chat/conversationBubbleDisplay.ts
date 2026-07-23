import type { UIMessage } from '@teralexi-ai'
import { filterThinkingConversationSections } from '@shared/agent/thinking-bubble-display'
import { userFacingTextFromStructuredOuter } from '@shared/agent/assistant-external-reply'
import { parseAssistantStructuredContent } from '@store/agent/context'
import {
  filterConversationBubbleSections,
  isReportDeliverableConversationSection,
  type StructuredDebugSection,
} from './structuredDebugViewModel'

export const THINKING_CONVERSATION_SECTION_IDS = new Set([
  'ThinkingStep',
  'thinking',
])

export const AGENTIC_RUN_CONVERSATION_SECTION_IDS = new Set([
  'toolLoop',
  'SkillsToolExecutionStep',
  'foreachItem',
])

/** Conversation step bubbles that carry the assistant's final response text. */
export const TEXT_RESPONSE_CONVERSATION_SECTION_IDS = new Set([
  'SummaryStep',
  'AnalysisStep',
  'summary',
  'analysis',
])

const FINAL_TEXT_PROGRESS_STEP_IDS = new Set([
  'summary',
  'SummaryStep',
  'analysis',
  'AnalysisStep',
])

function agentStepProgressStepId(data: { stepId?: unknown }): string {
  return typeof data.stepId === 'string' ? data.stepId.trim() : ''
}

function structuredMessageHasFinalResponseContent(
  structured: NonNullable<ReturnType<typeof parseAssistantStructuredContent>>,
): boolean {
  const outer = structured.assistantContent?.outer
  if (!outer) return false
  if (userFacingTextFromStructuredOuter(outer).trim()) return true
  for (const step of structured.assistantContent.subSteps ?? []) {
    if (
      (step.type === 'SummaryStep' || step.type === 'AnalysisStep') &&
      step.content?.trim()
    ) {
      return true
    }
  }
  return false
}

/** True once the assistant has begun streaming or showing its final response text. */
export function messageFinalTextStarted(message: UIMessage): boolean {
  if (message.role !== 'assistant') return false

  for (const part of message.parts) {
    if (part.type !== 'data-agent-step-progress') continue
    const data = (part as { data?: Record<string, unknown> }).data ?? {}
    const stepId = agentStepProgressStepId(data)
    if (!FINAL_TEXT_PROGRESS_STEP_IDS.has(stepId)) continue
    const content = typeof data.content === 'string' ? data.content.trim() : ''
    if (content) return true
  }

  for (const part of message.parts) {
    if (part.type !== 'text') continue
    const text = (part.text ?? '').trim()
    if (!text) continue
    const structured = parseAssistantStructuredContent(text)
    if (!structured) {
      // Plain markdown answer (not the structured pipeline JSON blob).
      return true
    }
    if (structuredMessageHasFinalResponseContent(structured)) return true
  }

  return false
}

export function isAgenticRunStepProgressPart(part: unknown): boolean {
  if (typeof part !== 'object' || part === null) return false
  if ((part as { type?: string }).type !== 'data-agent-step-progress') return false
  const stepId = agentStepProgressStepId(
    (part as { data?: { stepId?: unknown } }).data ?? {},
  )
  return stepId === 'toolLoop' || stepId === 'foreachItem'
}

export type ConversationBubbleDisplayOptions = {
  finalTextStarted?: boolean
  toolCallListDisplay?: import('@shared/agent/tool-call-list-display').ChatUiToolCallListDisplay
  thinkingBubbleDisplay?: import('@shared/agent/thinking-bubble-display').ChatUiThinkingBubbleDisplay
}

export function filterVisibleConversationBubbles<
  T extends StructuredDebugSection,
>(sections: readonly T[], options?: ConversationBubbleDisplayOptions): T[] {
  let result = filterConversationBubbleSections(sections)
  if (!options) return result

  if (options.finalTextStarted) {
    // Keep Thinking visible (classic bubble). Hide agentic-run section shells —
    // tool activity lives in the Exploring panel instead.
    result = result.filter(
      (section) => !AGENTIC_RUN_CONVERSATION_SECTION_IDS.has(section.id),
    )
  }

  if (options.thinkingBubbleDisplay) {
    result = filterThinkingConversationSections(
      result,
      options.thinkingBubbleDisplay,
      THINKING_CONVERSATION_SECTION_IDS,
    )
  }

  if (options.toolCallListDisplay === 'none') {
    result = result.filter(
      (section) => !AGENTIC_RUN_CONVERSATION_SECTION_IDS.has(section.id),
    )
  } else if (options.toolCallListDisplay === 'latest') {
    result = filterThinkingConversationSections(
      result,
      'latest',
      AGENTIC_RUN_CONVERSATION_SECTION_IDS,
    )
  }
  // compact / all: keep agentic-run sections (Exploring panel uses them as anchors)

  // Never hide every bubble — fall back to deliverable-filtered sections only.
  if (result.length === 0 && sections.length > 0) {
    return filterConversationBubbleSections(sections)
  }

  return result
}

export function isTextResponseConversationSection(
  section: Pick<StructuredDebugSection, 'id' | 'title'>,
): boolean {
  const id = section.id.trim()
  if (TEXT_RESPONSE_CONVERSATION_SECTION_IDS.has(id)) return true
  const lowerId = id.toLowerCase()
  if (lowerId === 'summary' || lowerId === 'analysis') return true
  if (lowerId.includes('summary') || lowerId.includes('analysis')) return true

  const title = section.title?.trim().toLowerCase() ?? ''
  if (title === 'summary' || title === 'analysis') return true
  if (title.includes('summary') || title.includes('analysis')) return true
  return false
}

const COMPACT_BY_DEFAULT_CONVERSATION_SECTION_IDS = new Set([
  ...AGENTIC_RUN_CONVERSATION_SECTION_IDS,
  'PlanningStep',
  'planning',
])

type ConversationSectionExpandHint = Pick<
  StructuredDebugSection,
  'id' | 'title' | 'bodyHtml' | 'bodyMarkdown' | 'sectionKind'
>

/** Last visible content bubble in the message — the primary assistant reply. */
export function isPrimaryReplyConversationSection(
  sections: readonly ConversationSectionExpandHint[],
  sectionIndex: number,
): boolean {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index]
    if (section.sectionKind === 'attachments') continue
    const hasBody = Boolean(
      section.bodyMarkdown?.trim() || section.bodyHtml?.trim(),
    )
    if (!hasBody) continue
    return index === sectionIndex
  }
  return false
}

/** Conversation bubbles start expanded except agentic / planning steps. */
export function conversationSectionExpandedByDefault(
  section: Pick<StructuredDebugSection, 'id' | 'title'>,
  opts?: { isPrimaryReply?: boolean },
): boolean {
  if (isTextResponseConversationSection(section)) return true
  if (opts?.isPrimaryReply) return true
  const id = section.id.trim()
  if (COMPACT_BY_DEFAULT_CONVERSATION_SECTION_IDS.has(id)) return false
  return true
}

export { isReportDeliverableConversationSection }
