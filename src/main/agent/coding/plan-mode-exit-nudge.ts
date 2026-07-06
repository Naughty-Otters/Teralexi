import { stepCountIs, type ModelMessage } from '@teralexi-ai'
import { EXIT_PLAN_MODE_TOOL_NAME } from '@toolSet/planning'
import type { AgentStepContext } from '../context'
import type { LlmDebugToolCallRecord } from '../llm/llm-debug-tool-calls'
import type { AgentCollectResult } from '../llm/ui-message-projector'
import { wrapSystemReminder } from '../injection/injector'
import { createLogger } from '@main/logger'
import { logLlmError } from '../llm/log-llm-error'

const log = createLogger('agent.plan-mode-exit-nudge')
import {
  createAgent,
  streamAgent,
  type StreamAgentParams,
} from '../steps/step-helpers'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import { assessPlanModeExitReadiness } from './plan-mode-exit-readiness'
import { isPlanModeActive } from './plan-mode-state'

const EXIT_PLAN_NUDGE_MAX_STEPS = 3

export const EXIT_PLAN_NUDGE_USER_TRIGGER =
  'Plan and todos are saved on disk. You MUST call exit_plan_mode now to request user approval. Do not reply with text only.'

export function streamIncludedExitPlanMode(
  toolCalls: readonly LlmDebugToolCallRecord[] | undefined,
): boolean {
  return (
    toolCalls?.some((call) => call.name === EXIT_PLAN_MODE_TOOL_NAME) ?? false
  )
}

function sandboxRootFromCtx(ctx: AgentStepContext): string | undefined {
  return ctx.sandbox?.getRoot?.()?.trim() || undefined
}

function pickExitNudgeTools(
  toolSet: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const name of [EXIT_PLAN_MODE_TOOL_NAME, 'read_todos'] as const) {
    if (toolSet[name]) picked[name] = toolSet[name]
  }
  return picked
}

export type NudgeExitPlanModeParams = {
  parentCtx: AgentStepContext
  toolLoopCtx: AgentStepContext
  collected: AgentCollectResult
  loopMessages: ModelMessage[]
  toolSet: Record<string, unknown>
  instructions: string
  haltCtrl: AbortSignal
  streamParams: Pick<
    StreamAgentParams,
    'onChunk' | 'onUIMessageChunk' | 'usageMeta' | 'debugCall'
  >
}

/**
 * When the model finishes planning (todos/plan on disk) without calling
 * `exit_plan_mode`, run one short continuation that can only exit — so the
 * user still gets the approval card instead of the run ending early.
 */
export async function nudgeExitPlanModeIfNeeded(
  params: NudgeExitPlanModeParams,
): Promise<AgentCollectResult> {
  const {
    parentCtx,
    toolLoopCtx,
    collected,
    loopMessages,
    toolSet,
    instructions,
    haltCtrl,
    streamParams,
  } = params

  const conversationId = parentCtx.opts.conversationId?.trim()
  if (!conversationId || !isPlanModeActive(conversationId)) return collected
  if (collected.awaitingToolApproval) return collected
  if (streamIncludedExitPlanMode(collected.toolCalls)) return collected

  const readiness = assessPlanModeExitReadiness(conversationId, {
    sandboxRoot: sandboxRootFromCtx(parentCtx),
  })
  if (!readiness.ready) return collected

  const exitTools = pickExitNudgeTools(toolSet)
  if (!exitTools[EXIT_PLAN_MODE_TOOL_NAME]) {
    log.warn('Skipping exit_plan_mode nudge — tool not in tool set', {
      conversationId,
    })
    return collected
  }

  log.info('Plan ready but exit_plan_mode missing — running exit nudge stream', {
    conversationId,
    todoCount: readiness.todoCount,
    planFilePath: readiness.planFilePath,
  })

  const nudgeMessages: ModelMessage[] = [...loopMessages]
  const assistantText = collected.text.trim()
  if (assistantText) {
    nudgeMessages.push({ role: 'assistant', content: assistantText })
  }
  nudgeMessages.push(wrapSystemReminder(EXIT_PLAN_NUDGE_USER_TRIGGER))

  const toolLoopChoice = parentCtx.resolveStageChoice('toolLoop')
  const nudgeAgent = createAgent({
    name: 'tool-loop-exit-plan-nudge',
    model: parentCtx.resolveStageModel('toolLoop'),
    tools: exitTools,
    instructions,
    stopWhen: [stepCountIs(EXIT_PLAN_NUDGE_MAX_STEPS)],
    abortSignal: haltCtrl,
    toolChoice: 'required',
    provider: toolLoopChoice.provider,
    modelId: toolLoopChoice.model,
  })

  try {
    return await streamAgent({
      agent: nudgeAgent,
      messages: nudgeMessages,
      toolRunCtx: toolLoopCtx,
      ...streamParams,
      debugCall: {
        instructions,
        toolNames: Object.keys(exitTools),
        label: 'toolLoop-exit-plan-nudge',
      },
    })
  } catch (err) {
    logLlmError('exit_plan_mode nudge stream failed', err, {
      path: 'plan-mode-exit-nudge',
      conversationId,
    })
    return collected
  }
}
