import { createLogger } from '@main/logger'
import { EXIT_PLAN_MODE_TOOL_NAME } from '@toolSet/planning'
import type { ClientUiMessage } from '../utils/client-ui-parse'
import { isPlanExecutionActive, isPlanModeActive } from './plan-mode-state'

const log = createLogger('agent.plan-mode.exit-approval-resume')

export type ApprovedExitPlanModeCall = {
  toolCallId: string
  approvalId: string
  input: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toolNameFromPart(part: Record<string, unknown>): string | undefined {
  const type = typeof part.type === 'string' ? part.type : ''
  if (type === 'dynamic-tool') {
    const name = part.toolName
    return typeof name === 'string' && name.trim() ? name.trim() : undefined
  }
  if (type.startsWith('tool-')) {
    return type.slice('tool-'.length)
  }
  return undefined
}

/** Latest approved (not denied) `exit_plan_mode` call waiting on HITL resume. */
export function findApprovedExitPlanModeCall(
  messages: readonly ClientUiMessage[] | undefined,
): ApprovedExitPlanModeCall | null {
  if (!messages?.length) return null

  let lastAssistant: ClientUiMessage | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i]
      break
    }
  }
  if (!lastAssistant?.parts?.length) return null

  for (let i = lastAssistant.parts.length - 1; i >= 0; i--) {
    const part = lastAssistant.parts[i]
    if (!isRecord(part)) continue
    if (part.state !== 'approval-responded') continue
    if (toolNameFromPart(part) !== EXIT_PLAN_MODE_TOOL_NAME) continue

    const approval = part.approval
    if (!isRecord(approval) || approval.approved !== true) return null

    const toolCallId =
      typeof part.toolCallId === 'string' && part.toolCallId.trim()
        ? part.toolCallId.trim()
        : ''
    const approvalId =
      typeof approval.id === 'string' && approval.id.trim()
        ? approval.id.trim()
        : ''
    if (!toolCallId || !approvalId) return null

    return {
      toolCallId,
      approvalId,
      input: part.input,
    }
  }

  return null
}

export function clientUiIndicatesExitPlanModeApprovalResume(
  messages: readonly ClientUiMessage[] | undefined,
): boolean {
  return findApprovedExitPlanModeCall(messages) !== null
}

export type FinalizeExitPlanModeApprovalResult = {
  handled: boolean
  output?: unknown
  error?: string
}

/**
 * Run `exit_plan_mode` immediately after the user approved it in the UI.
 *
 * The AI SDK normally executes approved tools on the next stream, but plan-mode
 * injections while `planMode` is still true can steer the model back into planning
 * before `execute()` runs — leaving execution stuck in a loop.
 */
export async function finalizeExitPlanModeApprovalResume(args: {
  conversationId: string | undefined
  clientUi: readonly ClientUiMessage[] | undefined
  toolSet: Record<string, { execute?: (input: unknown) => Promise<unknown> }>
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
}): Promise<FinalizeExitPlanModeApprovalResult> {
  const conversationId = args.conversationId?.trim()
  if (!conversationId) return { handled: false }

  const call = findApprovedExitPlanModeCall(args.clientUi)
  if (!call) return { handled: false }

  if (isPlanExecutionActive(conversationId) && !isPlanModeActive(conversationId)) {
    log.debug('exit_plan_mode already finalized for conversation', {
      conversationId,
      toolCallId: call.toolCallId,
    })
    return { handled: false }
  }

  const tool = args.toolSet[EXIT_PLAN_MODE_TOOL_NAME]
  if (!tool?.execute) {
    return {
      handled: false,
      error: 'exit_plan_mode tool is not available in this tool loop.',
    }
  }

  log.info('Executing approved exit_plan_mode after HITL resume', {
    conversationId,
    toolCallId: call.toolCallId,
    approvalId: call.approvalId,
  })

  try {
    const output = await tool.execute(call.input)
    args.onUIMessageChunk?.({
      type: 'tool-output-available',
      toolCallId: call.toolCallId,
      toolName: EXIT_PLAN_MODE_TOOL_NAME,
      output,
    })
    return { handled: true, output }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('Failed to execute approved exit_plan_mode', {
      conversationId,
      toolCallId: call.toolCallId,
      err,
    })
    args.onUIMessageChunk?.({
      type: 'tool-output-error',
      toolCallId: call.toolCallId,
      toolName: EXIT_PLAN_MODE_TOOL_NAME,
      errorText: message,
    })
    return { handled: true, error: message }
  }
}
