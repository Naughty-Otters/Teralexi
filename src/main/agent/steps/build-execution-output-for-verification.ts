import { readFile, stat } from 'node:fs/promises'
import type { AgentFlowContext } from '../context'
import type { StepAttachment } from '@shared/agent/step-attachment'
import { formatToolResultForDisplay } from '@shared/tool-result/format-tool-result-for-display'

const MAX_PREVIEW_BYTES = 16 * 1024
const MAX_ATTACHMENT_FILES = 8

async function readAttachmentPreview(absPath: string): Promise<string | null> {
  try {
    const st = await stat(absPath)
    if (!st.isFile()) return null
    const buf = await readFile(absPath)
    const slice = buf.subarray(0, Math.min(buf.length, MAX_PREVIEW_BYTES))
    const text = slice.toString('utf8').trim()
    if (!text) return null
    return buf.length > MAX_PREVIEW_BYTES ? `${text}\n…[truncated]` : text
  } catch {
    return null
  }
}

/**
 * Build verifier input: agent summary plus previews of output files from the
 * tool loop (not terminal stdout alone).
 */
export async function buildExecutionOutputForVerification(options: {
  flow: AgentFlowContext
  todoId: number
  assistantText: string
  /** Last tool results from the todo run, when available. */
  toolResults?: unknown[]
  /** Output from verify_command when it passed. */
  deterministicCheck?: string
}): Promise<string> {
  const parts: string[] = []
  const summary = options.assistantText.trim()
  if (summary) {
    parts.push(`## Agent summary\n\n${summary}`)
  }

  const deterministic = options.deterministicCheck?.trim()
  if (deterministic) {
    parts.push(`## verify_command output\n\n\`\`\`text\n${deterministic}\n\`\`\``)
  }

  for (const raw of options.toolResults ?? []) {
    const block = formatToolResultForDisplay(raw).trim()
    if (block && !parts.includes(block)) {
      parts.push(`## Tool result\n\n${block}`)
    }
  }

  const attachments: StepAttachment[] = options.flow.getToolLoopAttachmentsForTodo(
    options.todoId,
  )

  let fileCount = 0
  for (const att of attachments) {
    if (fileCount >= MAX_ATTACHMENT_FILES) break
    const preview = await readAttachmentPreview(att.path)
    if (!preview) continue
    fileCount += 1
    const label = att.label?.trim() || att.path
    parts.push(`## Output file: ${label}\n\n\`\`\`text\n${preview}\n\`\`\``)
  }

  if (parts.length > 0) return parts.join('\n\n')

  return summary || '(no execution output recorded)'
}
