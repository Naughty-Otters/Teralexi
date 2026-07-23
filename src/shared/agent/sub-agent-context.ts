import type { AgentMessage } from '@main/agent/types'

/** Context passed from a parent run to a sub-agent (no parent sandbox access). */
export type SubAgentContextEnvelope = {
  rootRunId: string
  parentRunId: string
  conversationId?: string
  assistantMessageId?: string
  /** Full parent conversation thread. */
  messages: AgentMessage[]
  /** Pipeline stage summaries from the parent run. */
  pipelineMessages: AgentMessage[]
  workspacePath?: string
  delegationTask: string
  /**
   * Paths already read in this user turn (parent read ledger).
   * Sub-agents should reuse these instead of re-listing / re-reading.
   */
  readLedgerPaths?: string[]
  /**
   * When true, omit the full parent thread — keep task + ledger + short pipeline
   * only (Cursor-style explore isolation).
   */
  slimContext?: boolean
}

export function mergeContextEnvelopeMessages(
  envelope: SubAgentContextEnvelope,
): AgentMessage[] {
  const pipeline = envelope.pipelineMessages ?? []
  const thread = envelope.slimContext ? [] : (envelope.messages ?? [])
  const slimPipeline = envelope.slimContext
    ? pipeline.slice(-4)
    : pipeline
  const task = envelope.delegationTask.trim()

  const seen = new Set<string>()
  const merged: AgentMessage[] = []

  const workspaceBlock = formatSubAgentWorkspaceContext(envelope.workspacePath, {
    readLedgerPaths: envelope.readLedgerPaths,
    slimContext: envelope.slimContext,
  })
  if (workspaceBlock) {
    merged.push({ role: 'user', content: workspaceBlock })
    seen.add(`user:${workspaceBlock}`)
  }

  for (const msg of [...slimPipeline, ...thread]) {
    const key = `${msg.role}:${msg.content}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(msg)
  }

  if (task) {
    merged.push({ role: 'user', content: task })
  } else {
    merged.push({
      role: 'user',
      content: 'Complete the delegated task.',
    })
  }

  return merged
}

/** LLM-facing workspace hint for sub-agents (tools bind the same path at runtime). */
export function formatSubAgentWorkspaceContext(
  workspacePath: string | undefined,
  opts?: {
    readLedgerPaths?: string[]
    slimContext?: boolean
  },
): string | null {
  const ws = workspacePath?.trim()
  if (!ws) return null
  const lines = [
    '=== USER WORKSPACE (parent conversation) ===',
    `Project root: ${ws}`,
    'Use workspace-relative paths (e.g. src/search.ts) with file tools.',
    'Do not pass an empty path — use "." for the workspace root or a concrete relative path.',
  ]
  const ledger = opts?.readLedgerPaths?.filter((p) => p.trim()) ?? []
  if (ledger.length > 0) {
    lines.push(
      'Already read in this turn (do not read_file the same paths again unless the file changed):',
      ...ledger.slice(0, 30).map((p) => `- ${p}`),
    )
    if (ledger.length > 30) {
      lines.push(`- …and ${ledger.length - 30} more`)
    }
  } else if (opts?.slimContext) {
    lines.push(
      'Prefer lsp and read-only shell (rg/find) for discovery. Avoid blanket directory walks of the repo root unless required.',
    )
  }
  lines.push('=== END USER WORKSPACE ===')
  return lines.join('\n')
}

/** Trim from the front when message count exceeds budget (conservative fallback). */
export function trimContextMessages(
  messages: AgentMessage[],
  maxMessages = 120,
): AgentMessage[] {
  if (messages.length <= maxMessages) return messages
  const taskMsg = messages.at(-1)
  const head = messages.slice(0, -1)
  const trimmedHead = head.slice(-(maxMessages - 1))
  return taskMsg ? [...trimmedHead, taskMsg] : trimmedHead
}
