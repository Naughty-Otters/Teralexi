import { isFileChangeToolName } from '@shared/file-change/types'
import { ensureFileChangeFilesInOutput } from '@shared/file-change/parse-tool-file-changes'
import { inferToolResultType } from './infer-tool-result-type'
import { enrichToolResultRecord } from './tool-result-payload'
import type { ToolResultType } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Stamp {@link ToolResultType} on object-shaped tool results and normalize
 * payloads the chat UI expects (e.g. `files[]` for file-change tools).
 *
 * String results are left unchanged so the model still sees plain text where
 * tools return strings; the UI classifies those by tool name.
 */
export function normalizeToolResult(toolName: string, result: unknown): unknown {
  const record = asRecord(result)
  if (!record) return result

  let out = { ...record }

  if (isFileChangeToolName(toolName)) {
    out = ensureFileChangeFilesInOutput(out)
  } else if (inferToolResultType(toolName, out) === 'file_change') {
    out = ensureFileChangeFilesInOutput(out)
  }

  out = enrichToolResultRecord(toolName, out)

  const resultType = inferToolResultType(toolName, out)
  if (out.resultType === resultType) return out
  return { ...out, resultType }
}
