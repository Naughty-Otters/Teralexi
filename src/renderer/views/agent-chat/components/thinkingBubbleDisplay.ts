import { limitThinkingBubbleWords } from '@shared/text/limit-thinking-bubble-words'

/** Coalesce thinking-body DOM updates while tokens stream in. */
export const THINKING_STREAM_DISPLAY_INTERVAL_MS = 120

/**
 * Compact pane is ~70px; binding the full 2k-word buffer every delta is wasteful.
 * While collapsed + streaming, only paint a short tail.
 */
export const THINKING_COMPACT_STREAM_TAIL_CHARS = 900

const COMPACT_STREAM_OMISSION = '…\n'

/**
 * Text shown in the Thinking bubble body.
 * Streaming + compact → short tail (cheap). Expanded or finished → full capped text.
 */
export function thinkingBubbleDisplayText(options: {
  raw: string
  streaming: boolean
  expanded: boolean
}): string {
  const capped = limitThinkingBubbleWords(options.raw)
  if (!options.streaming || options.expanded) return capped
  if (capped.length <= THINKING_COMPACT_STREAM_TAIL_CHARS) return capped
  return `${COMPACT_STREAM_OMISSION}${capped.slice(-THINKING_COMPACT_STREAM_TAIL_CHARS)}`
}
