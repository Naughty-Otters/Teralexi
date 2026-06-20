/** Prefix for agent-level errors injected by chat transport on run failure. */
export const AGENT_ERROR_TEXT_PREFIX = '⚠ **Agent error:**'

/** Markdown marker emitted into step progress on LLM failures. */
export const LLM_ERROR_PROGRESS_MARKER = '⚠ **LLM error**'

export function isAgentErrorText(text: string): boolean {
  return text.trim().startsWith(AGENT_ERROR_TEXT_PREFIX)
}

export function isLlmErrorProgressText(text: string): boolean {
  return text.includes(LLM_ERROR_PROGRESS_MARKER)
}
