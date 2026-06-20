import { WORKFLOW_COMPILER_SKILL_ID } from '@shared/skills/workflow-panel-skills'
import { toIpcSerializable } from '@shared/utils/ipc-serializable'

export const WORKFLOW_COMPILER_AGENT_ID =
  `skill:${WORKFLOW_COMPILER_SKILL_ID}` as const

export function workflowStudioConversationId(workflowId: string): string {
  const id = workflowId.trim()
  if (!id) throw new Error('workflowId is required')
  return `wf-studio-${id}`
}

export type WorkflowCompileHints = {
  mermaidError?: string | null
  entityErrors?: string[]
  validationErrors?: string[]
}

export type RunWorkflowCompilerAgentIpcArgs = {
  conversationId: string
  workflowId: string
  assistantMessageId: string
  userId: string
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
  baseVersionId?: string
  compileHints?: WorkflowCompileHints
}

/** Plain JSON-safe payload for Electron IPC invoke (no Vue proxies). */
export function toRunWorkflowCompilerAgentIpcArgs(
  args: RunWorkflowCompilerAgentIpcArgs,
): RunWorkflowCompilerAgentIpcArgs {
  return toIpcSerializable({
    conversationId: String(args.conversationId),
    workflowId: String(args.workflowId),
    assistantMessageId: String(args.assistantMessageId),
    userId: String(args.userId),
    pendingUserMessage: args.pendingUserMessage
      ? {
          id: String(args.pendingUserMessage.id),
          content: String(args.pendingUserMessage.content),
          createdAt: String(args.pendingUserMessage.createdAt),
        }
      : undefined,
    baseVersionId: args.baseVersionId
      ? String(args.baseVersionId)
      : undefined,
    compileHints: args.compileHints
      ? {
          mermaidError: args.compileHints.mermaidError ?? null,
          entityErrors: [...(args.compileHints.entityErrors ?? [])].map(String),
          validationErrors: [...(args.compileHints.validationErrors ?? [])].map(
            String,
          ),
        }
      : undefined,
  })
}

export type RunWorkflowCompilerAgentIpcResult = {
  finalContent: string
  hasError: boolean
  errorMessage?: string
}
