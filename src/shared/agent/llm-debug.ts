/** User property key for global LLM debug file logging. */
export const LLM_DEBUG_MODE_PROPERTY_KEY = 'llm_debug_mode' as const

export function parseLlmDebugMode(raw: unknown): boolean {
  const v = String(raw ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

export function llmDebugModeToString(enabled: boolean): string {
  return enabled ? 'true' : 'false'
}
