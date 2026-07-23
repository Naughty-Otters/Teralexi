import { limitThinkingBubbleWords } from './limit-thinking-bubble-words'

export const REASONING_TRUNCATION_MARKER = '\n…[earlier reasoning omitted]\n'

export type ReasoningCapState = {
  buffer: string
}

export function createReasoningCapState(): ReasoningCapState {
  return { buffer: '' }
}

function visibleReasoningText(buffer: string, maxChars: number): string {
  const byChars =
    buffer.length <= maxChars
      ? buffer
      : `${REASONING_TRUNCATION_MARKER}${buffer.slice(-maxChars)}`
  // Hard ceiling: never show more than 2k words in the Thinking bubble.
  return limitThinkingBubbleWords(byChars)
}

/**
 * Append a reasoning delta while keeping at most `maxChars` visible characters
 * (most recent tail). Returns the UI delta to emit and whether the reasoning
 * part must be reset so the Chat SDK does not accumulate unbounded text.
 */
export function appendReasoningDeltaWithCap(
  state: ReasoningCapState,
  delta: string,
  maxChars: number,
): { emitDelta: string; resetPart: boolean; resetText?: string } {
  if (!delta) {
    return { emitDelta: '', resetPart: false }
  }

  const previousVisible = visibleReasoningText(state.buffer, maxChars)
  state.buffer += delta
  const nextVisible = visibleReasoningText(state.buffer, maxChars)

  if (nextVisible === previousVisible) {
    return { emitDelta: '', resetPart: false }
  }

  // Char or word caps reshaped the visible window — replace the UI part so the
  // Chat SDK does not keep accumulating unbounded text.
  if (nextVisible === previousVisible + delta) {
    return { emitDelta: delta, resetPart: false }
  }

  return { emitDelta: nextVisible, resetPart: true, resetText: nextVisible }
}
