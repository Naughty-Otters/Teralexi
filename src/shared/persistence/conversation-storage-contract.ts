/**
 * Conversation storage vs UI presentation contract.
 *
 * **Server-side storage (source of truth)**
 * - SQLite `messages.content`: user plain text; assistant structured JSON (v2).
 * - SQLite `tool_results`: individual tool inputs/outputs for recall and search.
 * - Written only from the main process (`conversation-store`, `engine/conversation`,
 *   `AgentFlowContext.buildStructuredAssistantContent`). Renderer never calls SaveMessage.
 * - Shaped by `limitMessageContentForPersistence` / `limitPersistedStepText` (size caps,
 *   head/tail truncation). Ephemeral fields such as `outer.streamingText` are dropped.
 *
 * **UI presentation (derived view)**
 * - Live stream: AI SDK `UIMessage` parts (tool rows, step-progress chunks) in the renderer.
 * - Reload/history: `structuredDebugViewModel` and chat components render stored JSON;
 *   bubble layout (e.g. hiding tool-loop bodies in main bubbles) must not mutate storage.
 * - Display-only truncation: `streamingBubbleTextLimit`, `truncateDisplay`, settings like
 *   `chatUiBubbleTextKeepChars`.
 *
 * Changing bubble appearance must not change what is persisted. Persistence must not import
 * renderer view-model modules.
 */

/** Fields removed from structured assistant JSON before SQLite write. */
export const EPHEMERAL_STRUCTURED_OUTER_FIELDS = ['streamingText'] as const

export type EphemeralStructuredOuterField =
  (typeof EPHEMERAL_STRUCTURED_OUTER_FIELDS)[number]

type StructuredStepBody = {
  content?: unknown
  stepType?: unknown
  type?: unknown
}

type StructuredPersistRoot = {
  version?: unknown
  assistantContent?: {
    outer?: {
      pipelineConversation?: unknown
      stepCaptures?: unknown
    }
    subSteps?: unknown
  }
}

function asStepRows(value: unknown): StructuredStepBody[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is StructuredStepBody =>
      Boolean(row) && typeof row === 'object',
  )
}

/**
 * Collect non-empty step body strings from persisted structured assistant JSON.
 * Used in tests to prove UI presentation can hide text without erasing storage.
 */
export function extractPersistedStepBodies(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  let parsed: StructuredPersistRoot
  try {
    parsed = JSON.parse(trimmed) as StructuredPersistRoot
  } catch {
    return trimmed ? [trimmed] : []
  }

  if (parsed.version !== 2 || !parsed.assistantContent) {
    return trimmed ? [trimmed] : []
  }

  const bodies: string[] = []
  const outer = parsed.assistantContent.outer

  for (const row of asStepRows(outer?.pipelineConversation)) {
    if (typeof row.content === 'string' && row.content.trim()) {
      bodies.push(row.content)
    }
  }
  for (const row of asStepRows(outer?.stepCaptures)) {
    if (typeof row.content === 'string' && row.content.trim()) {
      bodies.push(row.content)
    }
  }
  for (const row of asStepRows(parsed.assistantContent.subSteps)) {
    if (typeof row.content === 'string' && row.content.trim()) {
      bodies.push(row.content)
    }
  }

  return bodies
}

/** True when structured JSON still carries step bodies after persistence shaping. */
export function persistedStructuredContentHasStepBodies(raw: string): boolean {
  return extractPersistedStepBodies(raw).length > 0
}
