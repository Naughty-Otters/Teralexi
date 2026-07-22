import type { UIMessage } from '@teralexi-ai'
import {
  TOOL_RUN_SCOPE_PART_TYPE,
  extractToolCallId,
} from '@shared/agent/tool-run-scope'
import { isToolOrDynamicToolUIPart } from '@teralexi-ai'

export type ToolRunScopeRef = {
  runId: string
  parentRunId: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Build toolCallId → run scope from companion `data-tool-run-scope` parts. */
export function buildToolRunScopeIndex(
  message: UIMessage,
): Map<string, ToolRunScopeRef> {
  const index = new Map<string, ToolRunScopeRef>()
  for (const part of message.parts) {
    const row = asRecord(part)
    if (!row || row.type !== TOOL_RUN_SCOPE_PART_TYPE) continue
    const data = asRecord(row.data)
    if (!data) continue
    const toolCallId =
      typeof data.toolCallId === 'string' ? data.toolCallId.trim() : ''
    const runId = typeof data.runId === 'string' ? data.runId.trim() : ''
    const parentRunId =
      typeof data.parentRunId === 'string' ? data.parentRunId.trim() : ''
    if (!toolCallId || !runId || !parentRunId) continue
    index.set(toolCallId, { runId, parentRunId })
  }
  return index
}

export function resolveToolPartRunScope(
  part: unknown,
  scopeIndex: Map<string, ToolRunScopeRef>,
): ToolRunScopeRef | null {
  const row = asRecord(part)
  if (!row) return null

  const directRunId = typeof row.runId === 'string' ? row.runId.trim() : ''
  const directParent =
    typeof row.parentRunId === 'string' ? row.parentRunId.trim() : ''
  if (directRunId && directParent) {
    return { runId: directRunId, parentRunId: directParent }
  }

  const toolCallId = extractToolCallId(part)
  if (!toolCallId) return null
  return scopeIndex.get(toolCallId) ?? null
}

/** True when this tool part belongs to a nested sub-agent (has parentRunId). */
export function isSubAgentToolPart(
  part: unknown,
  scopeIndex: Map<string, ToolRunScopeRef>,
): boolean {
  return resolveToolPartRunScope(part, scopeIndex) != null
}

export function toolPartsForRun(
  message: UIMessage,
  runId: string,
  scopeIndex?: Map<string, ToolRunScopeRef>,
): unknown[] {
  const index = scopeIndex ?? buildToolRunScopeIndex(message)
  const target = runId.trim()
  if (!target) return []
  const out: unknown[] = []
  for (const part of message.parts) {
    if (!isToolOrDynamicToolUIPart(part as never)) continue
    const scope = resolveToolPartRunScope(part, index)
    if (scope?.runId === target) out.push(part)
  }
  return out
}

export function excludeSubAgentToolParts<T>(
  parts: readonly T[],
  scopeIndex: Map<string, ToolRunScopeRef>,
): T[] {
  return parts.filter((part) => !isSubAgentToolPart(part, scopeIndex))
}
