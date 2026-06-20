/**
 * Semantic tool result kinds used by the chat UI to pick a presentation card
 * (diff stack, terminal bubble, todo checklist, generic tool row).
 *
 * Set on every object-shaped tool execute result by {@link normalizeToolResult}
 * in the main-process tool loop (see apply-tool-result-presentation.ts).
 */
export const TOOL_RESULT_TYPES = [
  'file_change',
  'terminal',
  'query',
  'todo',
  'error',
  'raw',
] as const

export type ToolResultType = (typeof TOOL_RESULT_TYPES)[number]

export function isToolResultType(value: unknown): value is ToolResultType {
  return (
    typeof value === 'string' &&
    (TOOL_RESULT_TYPES as readonly string[]).includes(value)
  )
}
