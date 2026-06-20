import type { AgentLlmStage } from '@shared/agent/stage-llm-settings'
import type { AgentMessage } from '../types'
import type { AgentStepContext } from '../context'
import type { StepExpressionPlan } from './expression-plan'
import { buildExpressionLlmCallParams } from './llm-call-params'
import type { StreamTextParams } from '../llm/runtime'
import {
  runLlmObjectSilent,
  runLlmTextSilent,
  streamLlmObjectToStepProgress,
  streamLlmTextToStepProgress,
} from '../providers/stream'

/**
 * Expression LLM phase: `system_msg` → `streamText({ instructions, system, messages })`.
 */
export type RunExpressionLlmOptions = {
  maxOutputTokens?: number
  /** When false, collect LLM text without streaming tokens into step progress. */
  streamToProgress?: boolean
  stage?: AgentLlmStage
}

export type RunExpressionLlmObjectOptions = {
  output: StreamTextParams['output']
  maxOutputTokens?: number
  /** When false, collect structured output without streaming tokens into step progress. */
  streamToProgress?: boolean
  stage?: AgentLlmStage
}

export async function runExpressionLlmText(
  ctx: AgentStepContext,
  plan: Pick<StepExpressionPlan, 'instructions' | 'userPrompt'>,
  baseMessages: AgentMessage[],
  options?: RunExpressionLlmOptions,
): Promise<string> {
  const llmParams = buildExpressionLlmCallParams(plan, baseMessages)
  const instructions =
    llmParams.instructions &&
    ctx.config.withResponseLanguageInstruction(
      llmParams.instructions,
      ctx.opts.responseLanguage,
    )

  if (!instructions && llmParams.messages.length === 0) {
    return ''
  }

  const streamParams = {
    model: options?.stage ? ctx.resolveStageModel(options.stage) : ctx.model,
    ...(instructions ? { instructions, system: instructions } : {}),
    messages: llmParams.messages,
    abortSignal: ctx.opts.abortSignal,
    ...(options?.maxOutputTokens != null
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
  }

  if (options?.streamToProgress === false) {
    const { text } = await runLlmTextSilent(
      ctx,
      streamParams as Parameters<typeof runLlmTextSilent>[1],
    )
    return text
  }

  const { text } = await ctx.providers.streamTextToStepProgress(
    ctx,
    streamParams as Parameters<typeof ctx.providers.streamTextToStepProgress>[1],
  )
  return text.trim()
}

/** Expression structured LLM phase: `streamText` with schema `output`. */
export async function runExpressionLlmObject<T>(
  ctx: AgentStepContext,
  plan: Pick<StepExpressionPlan, 'instructions' | 'userPrompt'>,
  baseMessages: AgentMessage[],
  options: RunExpressionLlmObjectOptions,
): Promise<T> {
  const llmParams = buildExpressionLlmCallParams(plan, baseMessages)
  const instructions =
    llmParams.instructions &&
    ctx.config.withResponseLanguageInstruction(
      llmParams.instructions,
      ctx.opts.responseLanguage,
    )

  if (!instructions && llmParams.messages.length === 0) {
    return {} as T
  }

  const streamParams = {
    model: options.stage ? ctx.resolveStageModel(options.stage) : ctx.model,
    ...(instructions ? { instructions, system: instructions } : {}),
    messages: llmParams.messages,
    output: options.output,
    abortSignal: ctx.opts.abortSignal,
    ...(options.maxOutputTokens != null
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
  }

  if (options.streamToProgress === false) {
    const { output } = await runLlmObjectSilent<T>({
      ctx,
      streamParams: streamParams as StreamTextParams,
    })
    return output
  }

  const { output } = await streamLlmObjectToStepProgress<T>({
    ctx,
    streamParams: streamParams as StreamTextParams,
  })
  return output
}
