/**
 * AI SDK 7 agent-level tool approval policy.
 *
 * Complements per-tool `needsApproval` (still used for catalog/UI and session
 * "always allow"). Catch-all covers dynamic/MCP tools that may not carry the flag.
 */

import { runUserHooks } from '@main/agent/hooks/user-hooks'
import { mapPermissionDecision } from '@main/agent/hooks/hook-result-applier'

export type ToolApprovalStatus =
  | 'user-approval'
  | 'approved'
  | 'denied'
  | 'not-applicable'
  | undefined

export type ToolApprovalDecision =
  | ToolApprovalStatus
  | { type: Exclude<ToolApprovalStatus, undefined>; reason?: string }

export type ToolApprovalToolCall = {
  toolName?: string
  dynamic?: boolean
  needsApproval?: unknown
  input?: unknown
}

export type ToolApprovalHookContext = {
  userId?: string
  conversationId?: string
  agentId?: string
  workspacePath?: string | null
}

/**
 * Generic catch-all for Agent `toolApproval`:
 * - dynamic / unknown tools → user-approval
 * - tools that still have needsApproval truthy → user-approval
 * - otherwise → not-applicable (execute normally)
 *
 * Session "always allow" clears `needsApproval` before Agent creation, so those
 * tools pass through as not-applicable here.
 */
export function buildCatchAllToolApproval(params?: {
  /** Tool names that must never auto-run (extra deny/require list). */
  alwaysRequireApproval?: ReadonlySet<string> | readonly string[]
  hookContext?: ToolApprovalHookContext
}): (args: {
  toolCall: ToolApprovalToolCall
  tools?: Record<string, { needsApproval?: unknown }>
}) => ToolApprovalDecision | Promise<ToolApprovalDecision> {
  const always = new Set(
    Array.isArray(params?.alwaysRequireApproval)
      ? params.alwaysRequireApproval
      : params?.alwaysRequireApproval
        ? [...params.alwaysRequireApproval]
        : [],
  )
  const hookContext = params?.hookContext

  return async ({ toolCall, tools }) => {
    if (hookContext?.userId) {
      const hookResult = await runUserHooks(
        {
          event: 'onApprovalRequired',
          conversationId: hookContext.conversationId,
          agentId: hookContext.agentId,
          workspacePath: hookContext.workspacePath,
          toolName: toolCall.toolName,
          toolInput: toolCall.input ?? toolCall,
        },
        [],
        {
          userId: hookContext.userId,
          workspacePath: hookContext.workspacePath ?? undefined,
        },
      )
      const mapped = mapPermissionDecision(
        hookResult.hookSpecificOutput?.permissionDecision,
      )
      if (mapped === 'approved') return 'approved'
      if (mapped === 'denied' || hookResult.blocked) return 'denied'
      if (mapped === 'user-approval') return 'user-approval'
    }

    const name = toolCall.toolName?.trim() ?? ''
    if (name && always.has(name)) return 'user-approval'

    if (toolCall.dynamic) return 'user-approval'

    const fromCatalog = name ? tools?.[name]?.needsApproval : undefined
    const needs =
      toolCall.needsApproval === true ||
      fromCatalog === true ||
      (typeof fromCatalog === 'function' ? true : false)

    if (needs) return 'user-approval'
    return undefined
  }
}