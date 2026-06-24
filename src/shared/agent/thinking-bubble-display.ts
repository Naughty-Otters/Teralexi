export type ChatUiThinkingBubbleDisplay = 'none' | 'all' | 'latest'

export const CHAT_UI_THINKING_BUBBLE_DISPLAY_VALUES = [
  'none',
  'all',
  'latest',
] as const satisfies readonly ChatUiThinkingBubbleDisplay[]

/** Default: only the most recent thinking / reasoning bubble is shown. */
export const DEFAULT_CHAT_UI_THINKING_BUBBLE_DISPLAY: ChatUiThinkingBubbleDisplay =
  'latest'

export function parseChatUiThinkingBubbleDisplay(
  raw: string | undefined,
  fallback: ChatUiThinkingBubbleDisplay = DEFAULT_CHAT_UI_THINKING_BUBBLE_DISPLAY,
): ChatUiThinkingBubbleDisplay {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = raw.trim().toLowerCase()
  if (
    (CHAT_UI_THINKING_BUBBLE_DISPLAY_VALUES as readonly string[]).includes(
      value,
    )
  ) {
    return value as ChatUiThinkingBubbleDisplay
  }
  return fallback
}

export function shouldShowThinkingBubbles(
  mode: ChatUiThinkingBubbleDisplay,
): boolean {
  return mode !== 'none'
}

type BubbleKind = { kind: string }

/** Brief-mode reasoning/thinking bubbles from message reasoning parts. */
export function filterAssistantReasoningBubbles<T extends BubbleKind>(
  bubbles: readonly T[],
  mode: ChatUiThinkingBubbleDisplay,
): T[] {
  if (mode === 'all') return [...bubbles]
  if (mode === 'none') {
    return bubbles.filter((bubble) => bubble.kind !== 'reasoning')
  }

  let lastReasoningIndex = -1
  for (let index = 0; index < bubbles.length; index += 1) {
    if (bubbles[index]!.kind === 'reasoning') lastReasoningIndex = index
  }
  if (lastReasoningIndex === -1) return [...bubbles]
  return bubbles.filter(
    (bubble, index) =>
      bubble.kind !== 'reasoning' || index === lastReasoningIndex,
  )
}

type SectionId = { id: string }

/** Conversation-mode ThinkingStep sections. */
export function filterThinkingConversationSections<T extends SectionId>(
  sections: readonly T[],
  mode: ChatUiThinkingBubbleDisplay,
  thinkingSectionIds: ReadonlySet<string>,
): T[] {
  if (mode === 'all') return [...sections]
  if (mode === 'none') {
    return sections.filter((section) => !thinkingSectionIds.has(section.id))
  }

  let lastThinkingIndex = -1
  for (let index = 0; index < sections.length; index += 1) {
    if (thinkingSectionIds.has(sections[index]!.id)) {
      lastThinkingIndex = index
    }
  }
  if (lastThinkingIndex === -1) return [...sections]
  return sections.filter(
    (section, index) =>
      !thinkingSectionIds.has(section.id) || index === lastThinkingIndex,
  )
}
