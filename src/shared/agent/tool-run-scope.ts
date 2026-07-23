/**
 * Run-scoped attribution for tool UI chunks streamed from nested sub-agents.
 * Companion `data-tool-run-scope` parts survive even if tool-* chunk fields are stripped.
 */

export const TOOL_RUN_SCOPE_PART_TYPE = 'data-tool-run-scope' as const

export type ToolRunScope = {
  toolCallId: string
  runId: string
  parentRunId: string
}

export function isToolUiChunkType(type: unknown): boolean {
  if (typeof type !== 'string' || !type.trim()) return false
  const t = type.trim()
  return (
    t.startsWith('tool-') ||
    t === 'tool-input-start' ||
    t === 'tool-input-delta' ||
    t === 'tool-input-available' ||
    t === 'tool-output-available' ||
    t === 'tool-output-error' ||
    t === 'tool-output-denied' ||
    t === 'tool-approval-request'
  )
}

/** Extract toolCallId from an AI SDK UI stream chunk or materialized tool part. */
export function extractToolCallId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const row = value as Record<string, unknown>
  if (typeof row.toolCallId === 'string' && row.toolCallId.trim()) {
    return row.toolCallId.trim()
  }
  const nested = row.toolCall
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const id = (nested as { toolCallId?: unknown }).toolCallId
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return ''
}

export function stampToolUiChunkWithRunScope(
  chunk: Record<string, unknown>,
  scope: { runId: string; parentRunId: string },
): Record<string, unknown> {
  return {
    ...chunk,
    runId: scope.runId,
    parentRunId: scope.parentRunId,
  }
}

export function buildToolRunScopeChunk(scope: ToolRunScope): Record<string, unknown> {
  return {
    type: TOOL_RUN_SCOPE_PART_TYPE,
    id: `tool-run-scope-${scope.toolCallId}`,
    data: {
      toolCallId: scope.toolCallId,
      runId: scope.runId,
      parentRunId: scope.parentRunId,
    },
  }
}
