/**
 * Tool result recording — persists every tool call + result to the
 * tool_results SQLite table so they can be recalled via FTS5 search
 * and used for pre-pruning summaries on HITL resume.
 *
 * Apply AFTER applyToolOutputTruncation so the stored output matches
 * the (already-capped) text the model actually sees.
 * Apply BEFORE applyPerStreamToolInputDedupe.
 */

import { randomUUID } from 'crypto'
import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import type { StoredToolResult } from '@main/services/conversation-store/types'
import { summarizeToolInput } from '@shared/tool-result/summarize-tool-input'

const log = createLogger('agent.expr.tool-result-recorder')

/** Max chars stored in output_text for FTS indexing. */
const OUTPUT_TEXT_STORE_LIMIT = 12_000

export interface ToolResultRecordingCtx {
  conversationId: string
  agentId: string
  stepId: string
  /** Thread tag for the user request that triggered this tool loop. */
  threadTag?: string
}

/**
 * Wrap each tool's execute() to record its output to the tool_results table.
 * Must be called AFTER applyToolOutputTruncation (records truncated output)
 * and BEFORE applyPerStreamToolInputDedupe.
 */
export function applyToolResultRecording(
  toolSet: Record<string, unknown>,
  ctx: ToolResultRecordingCtx,
): void {
  const { conversationId, agentId, stepId } = ctx
  if (!conversationId) return

  for (const name of Object.keys(toolSet)) {
    const spec = toolSet[name] as Record<string, unknown> | null
    if (!spec || typeof spec['execute'] !== 'function') continue

    const origExecute = (spec['execute'] as (...a: unknown[]) => Promise<unknown>).bind(spec)

    spec['execute'] = async (input: unknown): Promise<unknown> => {
      const startedAt = new Date().toISOString()
      let result: unknown
      let isError = false

      try {
        result = await origExecute(input)
      } catch (err) {
        isError = true
        result = err instanceof Error ? err.message : String(err)
        log.error('Tool execute failed (recording wrapper)', {
          toolName: name,
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        throw err
      } finally {
        try {
          const record = buildRecord({
            conversationId,
            agentId,
            stepId,
            toolName: name,
            input,
            result,
            isError,
            createdAt: startedAt,
            threadTag: ctx.threadTag,
          })
          getConversationStore().saveToolResult(record)
        } catch (storeErr) {
          log.warn('Failed to record tool result', { toolName: name, storeErr })
        }
      }

      return result
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildRecord(args: {
  conversationId: string
  agentId: string
  stepId: string
  toolName: string
  input: unknown
  result: unknown
  isError: boolean
  createdAt: string
  threadTag?: string
}): StoredToolResult {
  const { conversationId, agentId, stepId, toolName, input, result, isError, createdAt, threadTag } = args

  const outputText = toOutputText(result)
  const outputChars = outputText.length

  return {
    id: randomUUID(),
    conversationId,
    agentId,
    stepId,
    toolName,
    inputSummary: summarizeToolInput(input),
    outputText: outputText.slice(0, OUTPUT_TEXT_STORE_LIMIT),
    outputSummary: summarizeOutput(toolName, result, isError),
    outputChars,
    isError,
    createdAt,
    threadTag: threadTag ?? 'general',
  }
}

function toOutputText(result: unknown): string {
  if (typeof result === 'string') return result
  if (result === null || result === undefined) return ''
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

/** Compact one-liner for display in pre-pruning context. */
export function summarizeOutput(
  toolName: string,
  result: unknown,
  isError: boolean,
): string {
  if (isError) {
    const msg = result instanceof Error ? result.message : String(result ?? '')
    return `[${toolName}] ERROR: ${msg.slice(0, 120)}`
  }

  if (typeof result === 'string') {
    const chars = result.length
    const preview = result.slice(0, 80).replace(/\n/g, ' ').trimEnd()
    return chars <= 80
      ? `[${toolName}] ${preview}`
      : `[${toolName}] ${chars} chars: "${preview}..."`
  }

  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>
    const parts: string[] = []
    if (typeof r['exit_code'] === 'number') parts.push(`exit_code=${r['exit_code']}`)
    if (typeof r['success'] === 'boolean') parts.push(`success=${r['success']}`)
    if (typeof r['error'] === 'string' && r['error']) {
      parts.push(`error="${String(r['error']).slice(0, 80)}"`)
    }
    if (parts.length === 0) {
      const topKeys = Object.keys(r).slice(0, 3).join(', ')
      if (topKeys) parts.push(`{${topKeys}}`)
    }
    const totalChars = toOutputText(result).length
    return `[${toolName}] ${parts.join(', ')}${parts.length ? ', ' : ''}${totalChars} chars`
  }

  return `[${toolName}] ${String(result).slice(0, 100)}`
}

