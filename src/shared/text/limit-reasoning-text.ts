export const REASONING_TRUNCATION_MARKER = '\n…[earlier reasoning omitted]\n'

export type ReasoningCapState = {
  buffer: string
}

export function createReasoningCapState(): ReasoningCapState {
  return { buffer: '' }
}

function visibleReasoningText(buffer: string, maxChars: number): string {
  if (buffer.length <= maxChars) return buffer
  return `${REASONING_TRUNCATION_MARKER}${buffer.slice(-maxChars)}`
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

  if (state.buffer.length > maxChars) {
    return { emitDelta: nextVisible, resetPart: true, resetText: nextVisible }
  }

  return { emitDelta: delta, resetPart: false }
}
