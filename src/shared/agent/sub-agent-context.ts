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
}

export function mergeContextEnvelopeMessages(
  envelope: SubAgentContextEnvelope,
): AgentMessage[] {
  const pipeline = envelope.pipelineMessages ?? []
  const thread = envelope.messages ?? []
  const task = envelope.delegationTask.trim()

  const seen = new Set<string>()
  const merged: AgentMessage[] = []

  const workspaceBlock = formatSubAgentWorkspaceContext(envelope.workspacePath)
  if (workspaceBlock) {
    merged.push({ role: 'user', content: workspaceBlock })
    seen.add(`user:${workspaceBlock}`)
  }

  for (const msg of [...pipeline, ...thread]) {
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
): string | null {
  const ws = workspacePath?.trim()
  if (!ws) return null
  return [
    '=== USER WORKSPACE (parent conversation) ===',
    `Project root: ${ws}`,
    'Use workspace-relative paths (e.g. src/search.ts) with list_files, read_file, grep_files, and edit_file.',
    'Do not pass an empty path — use "." for the workspace root or a concrete relative path.',
    '=== END USER WORKSPACE ===',
  ].join('\n')
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
