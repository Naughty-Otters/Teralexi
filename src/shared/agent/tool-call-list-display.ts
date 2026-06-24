export type ChatUiToolCallListDisplay = 'none' | 'all' | 'latest'

export const CHAT_UI_TOOL_CALL_LIST_DISPLAY_VALUES = [
  'none',
  'all',
  'latest',
] as const satisfies readonly ChatUiToolCallListDisplay[]

export const DEFAULT_CHAT_UI_TOOL_CALL_LIST_DISPLAY: ChatUiToolCallListDisplay =
  'none'

export function parseChatUiToolCallListDisplay(
  raw: string | undefined,
  fallback: ChatUiToolCallListDisplay = DEFAULT_CHAT_UI_TOOL_CALL_LIST_DISPLAY,
): ChatUiToolCallListDisplay {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = raw.trim().toLowerCase()
  if (
    (CHAT_UI_TOOL_CALL_LIST_DISPLAY_VALUES as readonly string[]).includes(value)
  ) {
    return value as ChatUiToolCallListDisplay
  }
  if (value === 'true' || value === '1' || value === 'yes') return 'all'
  if (value === 'false' || value === '0' || value === 'no') return 'none'
  return fallback
}

export function shouldShowToolCallLists(
  mode: ChatUiToolCallListDisplay,
): boolean {
  return mode !== 'none'
}

export function shouldHideAgenticRunConversationSections(
  mode: ChatUiToolCallListDisplay,
): boolean {
  return mode === 'none'
}

type BubbleKind = { kind: string }

/** Brief-mode tool-group bubbles: none hides all; latest keeps the last group. */
export function filterAssistantToolGroupBubbles<T extends BubbleKind>(
  bubbles: readonly T[],
  mode: ChatUiToolCallListDisplay,
): T[] {
  if (mode === 'all') return [...bubbles]
  if (mode === 'none') {
    return bubbles.filter((bubble) => bubble.kind !== 'tool-group')
  }

  let lastToolGroupIndex = -1
  for (let index = 0; index < bubbles.length; index += 1) {
    if (bubbles[index]!.kind === 'tool-group') lastToolGroupIndex = index
  }
  if (lastToolGroupIndex === -1) return [...bubbles]
  return bubbles.filter(
    (bubble, index) =>
      bubble.kind !== 'tool-group' || index === lastToolGroupIndex,
  )
}

/** Conversation tool-loop panels: none hides all; latest keeps the last slot. */
export function filterToolLoopPanelSlots<T>(
  slots: readonly T[],
  mode: ChatUiToolCallListDisplay,
): T[] {
  if (mode === 'none') return []
  if (mode === 'latest' && slots.length > 1) {
    return [slots[slots.length - 1]!]
  }
  return [...slots]
}

/** Legacy per-tool response bubbles when the compact panel is not used. */
export function filterConversationToolResponseBubbles<T>(
  bubbles: readonly T[],
  mode: ChatUiToolCallListDisplay,
): T[] {
  if (mode === 'none') return []
  if (mode === 'latest' && bubbles.length > 1) {
    return [bubbles[bubbles.length - 1]!]
  }
  return [...bubbles]
}
