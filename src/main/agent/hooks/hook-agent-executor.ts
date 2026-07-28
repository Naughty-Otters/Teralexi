import type {
  HookInvocationContext,
  HookRunResult,
  RunnableAgentHookBinding,
} from '@shared/agent/hooks'
import { BLOCKING_HOOK_EVENTS } from '@shared/agent/hooks'
import { resolveSubAgentSummaryText } from '@main/agent/run/sub-flow-output-text'
import type { HookResult } from '@teralexi/skill-sdk'
import type { SubAgentParentRun } from '@toolSet/sub-agents/delegation-context'
import type { RunUserHooksOptions } from './user-hooks'

const AGENT_HOOK_TASK_PREFIX = `You are an extension hook judge. Analyze the hook context and reply with ONLY a JSON object:
{"continue":boolean,"stopReason"?:string,"hookSpecificOutput"?:{"additionalContext"?:string,"updatedInput"?:object,"permissionDecision"?:"allow"|"deny"|"ask"}}

Hook event:`

function parseAgentHookResult(text: string): HookResult | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as HookResult
    if (typeof parsed.continue !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

function buildAgentHookTask(ctx: HookInvocationContext): string {
  return [
    AGENT_HOOK_TASK_PREFIX,
    ctx.event,
    '',
    'Context JSON:',
    JSON.stringify(ctx, null, 2),
  ].join('\n')
}

export async function execAgentHook(
  binding: RunnableAgentHookBinding,
  ctx: HookInvocationContext,
  options?: RunUserHooksOptions,
): Promise<HookRunResult> {
  const parentRun = options?.hookDelegation?.parentRun as SubAgentParentRun | undefined
  const parentOpts = options?.hookDelegation?.parentOpts
  if (!parentRun?.executeChildAndMerge || !parentOpts) {
    return {
      blocked: false,
      message: 'Agent hook skipped: no active parent run context',
    }
  }

  try {
    const result = await parentRun.executeChildAndMerge({
      agentId: binding.agentId,
      parentOpts,
      task: buildAgentHookTask(ctx),
      slimContext: true,
      allowedToolNames: [],
    })

    const summary = resolveSubAgentSummaryText(result.stepOutputs)
    const parsed = parseAgentHookResult(summary)
    if (!parsed) {
      return {
        blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
        message: 'Agent hook did not return valid JSON',
      }
    }
    if (!parsed.continue) {
      return {
        blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
        message: parsed.stopReason ?? 'Blocked by agent hook',
        hookSpecificOutput: parsed.hookSpecificOutput,
      }
    }
    return {
      blocked: false,
      ...(parsed.hookSpecificOutput ? { hookSpecificOutput: parsed.hookSpecificOutput } : {}),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
      message: `Agent hook failed: ${message}`,
    }
  }
}
