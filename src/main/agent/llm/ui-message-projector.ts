import { addPendingApprovalKeys } from './approval-keys'
import {
  formatToolResultForDisplay,
  type FormatToolResultOpts,
} from '@shared/tool-result/format-tool-result-for-display'
import type { LlmDebugToolCallRecord } from './llm-debug-tool-calls'

const AGENT_COLLECT_JSON_MAX = 120_000

/** UI chunks that carry no Chat IPC payload (stream lifecycle only). */
export function isStructuralUiChunkType(type: unknown): boolean {
  return (
    type === 'text-start' ||
    type === 'text-end' ||
    type === 'reasoning-start' ||
    type === 'reasoning-end' ||
    type === 'start-step' ||
    type === 'finish-step' ||
    type === 'start' ||
    type === 'finish'
  )
}

/**
 * Forward authoritative SDK {@link toUIMessageStream} chunks to the renderer.
 * Text/reasoning deltas are omitted — those are driven by `fullStream` → `onChunk`.
 */
export async function forwardAgentUiMessageStream(args: {
  result: AgentStreamCollectSource
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
  pendingApprovals: Set<string>
  mode?: 'progress' | 'silent'
}): Promise<void> {
  const { result, onUIMessageChunk, pendingApprovals, mode = 'progress' } = args
  if (mode === 'silent' || typeof onUIMessageChunk !== 'function') return
  if (typeof result.toUIMessageStream !== 'function') return

  for await (const chunk of result.toUIMessageStream()) {
    const rec = chunk as Record<string, unknown>
    const type = rec.type
    if (type === 'text-delta' || type === 'reasoning-delta') continue
    if (isStructuralUiChunkType(type)) continue
    if (type === 'tool-approval-request') {
      addPendingApprovalKeys(pendingApprovals, rec)
    }
    onUIMessageChunk(rec)
  }
}

export function serializeForAgentCollect(
  value: unknown,
  opts?: FormatToolResultOpts,
): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value

  const formatted = formatToolResultForDisplay(value, opts)
  if (formatted.length <= AGENT_COLLECT_JSON_MAX) return formatted

  return `${formatted.slice(0, AGENT_COLLECT_JSON_MAX)}\n…[truncated]`
}

export function collectToolCallIdsWithResultsFromSteps(steps: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(steps)) return ids
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    const s = step as {
      toolResults?: ReadonlyArray<{ toolCallId?: string }> | null
      staticToolResults?: ReadonlyArray<{ toolCallId?: string }> | null
      dynamicToolResults?: ReadonlyArray<{ toolCallId?: string }> | null
    }
    const rows = [
      ...(s.toolResults ?? []),
      ...(s.staticToolResults ?? []),
      ...(s.dynamicToolResults ?? []),
    ]
    for (const row of rows) {
      if (row && typeof row.toolCallId === 'string' && row.toolCallId.trim()) {
        ids.add(row.toolCallId.trim())
      }
    }
  }
  return ids
}

export async function reconcilePendingApprovalKeys(
  pending: Set<string>,
  steps: unknown,
): Promise<Set<string>> {
  if (pending.size === 0) return pending
  const next = new Set(pending)
  try {
    const withResults = collectToolCallIdsWithResultsFromSteps(steps)
    for (const key of pending) {
      if (key.startsWith('approval:')) continue
      if (withResults.has(key)) next.delete(key)
    }
  } catch {
    // keep stream-derived pending set
  }
  return next
}

export type AgentStreamCollectSource = {
  textStream: AsyncIterable<string>
  response: PromiseLike<unknown>
  /** Authoritative Chat UI chunks (tool approval, tool parts, …). */
  toUIMessageStream?: () => AsyncIterable<unknown>
  steps?: PromiseLike<unknown>
  text?: PromiseLike<string>
  fullStream?: AsyncIterable<unknown>
  toolResults?: PromiseLike<ReadonlyArray<unknown>>
  totalUsage?: PromiseLike<import('ai').LanguageModelUsage>
  usage?: PromiseLike<import('ai').LanguageModelUsage>
}

type ToolResultRow = {
  output?: unknown
  toolName?: string
  input?: unknown
  args?: unknown
}

/** True for formatter placeholders like `**result** _(empty)_` / `_(no output)_`. */
export function isPlaceholderToolResultDisplay(formatted: string): boolean {
  const trimmed = formatted.trim()
  if (!trimmed) return true
  return /_\((?:empty|no output|no diff preview)\)_\s*$/i.test(trimmed)
}

export async function collectToolOutputFallbackText(
  result: AgentStreamCollectSource,
): Promise<string> {
  const blocks: string[] = []
  try {
    if (result.steps) {
      const steps = (await result.steps) as Array<{
        text?: string
        toolResults?: ReadonlyArray<ToolResultRow>
        staticToolResults?: ReadonlyArray<ToolResultRow>
        dynamicToolResults?: ReadonlyArray<ToolResultRow>
      }>
      if (Array.isArray(steps)) {
        for (const step of steps) {
          if (step.text?.trim()) blocks.push(step.text.trim())
          const rows = [
            ...(step.toolResults ?? []),
            ...(step.staticToolResults ?? []),
            ...(step.dynamicToolResults ?? []),
          ]
          for (const r of rows) {
            if (!r || typeof r !== 'object' || !('output' in r)) continue
            const toolName =
              typeof r.toolName === 'string' ? r.toolName.trim() : ''
            const toolInput = r.input !== undefined ? r.input : r.args
            const ser = serializeForAgentCollect(r.output, {
              ...(toolName ? { toolName } : {}),
              ...(toolInput !== undefined ? { toolInput } : {}),
            })
            const trimmed = ser.trim()
            // Skip empty query/todo/terminal placeholders so thinking-research
            // (and other tool-only passes) don't dump "result (empty)" spam.
            if (!trimmed || isPlaceholderToolResultDisplay(trimmed)) continue
            blocks.push(trimmed)
          }
        }
      }
    }
  } catch {
    // stream may still have partial UI text
  }
  if (blocks.length === 0 && result.text) {
    try {
      const t = await result.text
      if (t?.trim()) blocks.push(t.trim())
    } catch {
      // ignore
    }
  }
  return blocks.filter(Boolean).join('\n\n')
}

export type AgentCollectResult = {
  text: string
  awaitingToolApproval: boolean
  toolCalls?: LlmDebugToolCallRecord[]
}
