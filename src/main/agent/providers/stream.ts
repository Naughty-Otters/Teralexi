import type { AgentStepContext } from '../context'
import { serializeAgentRuntimeContext } from '../llm/llm-debug-runtime-context'
import type { LlmDebugContext } from '../llm/llm-debug-writer'
import { runLlmStream, type StreamTextParams } from '../llm/runtime'
import { createLogger } from '@main/logger'
import { readStreamTextUsage, recordLlmTokenUsageFromOpts } from './usage'
import {
  createLlmRetryContext,
  type LlmRetryContext,
  withLlmRetry,
} from './retry-utils'

export type { StreamTextParams } from '../llm/runtime'

const log = createLogger('agent.providers.stream')

function stepRetryContext(ctx: AgentStepContext): LlmRetryContext {
  return {
    emitStepProgress: (chunk) => ctx.emitStepProgress(chunk),
    opts: { abortSignal: ctx.opts.abortSignal },
    logMeta: {
      stepId: ctx.stepId,
      provider: ctx.opts.provider,
      model: ctx.opts.model,
      conversationId: ctx.opts.conversationId,
      agentId: ctx.opts.agentId,
    },
  }
}

function llmValidationContext(
  ctx: AgentStepContext,
  label: string,
): { validationContext: { label: string; stepId: string | null; conversationId?: string; agentId?: string } } {
  return {
    validationContext: {
      label,
      stepId: ctx.stepId,
      conversationId: ctx.opts.conversationId,
      agentId: ctx.opts.agentId,
    },
  }
}

function llmDebugContext(ctx: AgentStepContext): LlmDebugContext {
  return {
    userId: ctx.opts.userId,
    conversationId: ctx.opts.conversationId,
    agentId: ctx.opts.agentId,
    llmDebugRunId: ctx.opts.llmDebugRunId,
    stepId: ctx.stepId,
    runtimeSnapshot: serializeAgentRuntimeContext(ctx),
    refreshRuntimeSnapshot: () => serializeAgentRuntimeContext(ctx),
  }
}

function resolveAbortSignal(
  params: StreamTextParams,
  abortSignal?: AbortSignal,
): AbortSignal | undefined {
  return params.abortSignal ?? abortSignal
}

/** Structured LLM output with retry (no AgentStepContext — memory, compile, etc.). */
export async function runLlmObjectWithRetry<T>(
  params: {
    streamParams: StreamTextParams
    label: string
    abortSignal?: AbortSignal
    logMeta?: Record<string, unknown>
  },
): Promise<T> {
  const retryCtx = createLlmRetryContext(params.abortSignal, {
    ...params.logMeta,
    callKind: 'object',
  })
  log.debug('Background LLM object call', {
    label: params.label,
    ...params.logMeta,
  })
  return withLlmRetry(retryCtx, params.label, async () => {
    const { output, response } = await runLlmStream({
      streamParams: {
        ...params.streamParams,
        abortSignal: resolveAbortSignal(
          params.streamParams,
          params.abortSignal,
        ),
      } as StreamTextParams,
      mode: 'silent',
      validationContext: {
        label: params.label,
        ...params.logMeta,
      },
    })
    return (output ?? (await response.output)) as T
  })
}

/** LLM text with retry (no AgentStepContext — skill compile, etc.). */
export async function runLlmTextWithRetry(params: {
  streamParams: StreamTextParams
  label: string
  abortSignal?: AbortSignal
  logMeta?: Record<string, unknown>
}): Promise<string> {
  const retryCtx = createLlmRetryContext(params.abortSignal, {
    ...params.logMeta,
    callKind: 'text',
  })
  log.debug('Background LLM text call', {
    label: params.label,
    ...params.logMeta,
  })
  const { text } = await withLlmRetry(retryCtx, params.label, async () => {
    const result = await runLlmStream({
      streamParams: {
        ...params.streamParams,
        abortSignal: resolveAbortSignal(
          params.streamParams,
          params.abortSignal,
        ),
      } as StreamTextParams,
      mode: 'silent',
      validationContext: {
        label: params.label,
        ...params.logMeta,
      },
    })
    return { text: result.text.trim() }
  })
  return text
}

/** Collect LLM text without forwarding tokens to step progress (e.g. JSON thinking pass). */
export async function runLlmTextSilent(
  ctx: AgentStepContext,
  params: StreamTextParams,
): Promise<{ text: string }> {
  return withLlmRetry(stepRetryContext(ctx), 'streamText:silent', async () => {
    const { text, response } = await runLlmStream({
      streamParams: {
        ...params,
        abortSignal: params.abortSignal ?? ctx.opts.abortSignal,
      } as StreamTextParams,
      mode: 'silent',
      ...llmValidationContext(ctx, 'streamText:silent'),
      llmDebug: llmDebugContext(ctx),
    })
    recordLlmTokenUsageFromOpts(
      ctx.opts,
      { source: 'streamTextSilent', stepId: ctx.stepId },
      await readStreamTextUsage(response),
    )
    return { text: text.trim() }
  })
}

export async function streamLlmTextToStepProgress(
  ctx: AgentStepContext,
  params: StreamTextParams,
): Promise<{ text: string }> {
  return withLlmRetry(stepRetryContext(ctx), 'streamText:progress', async () => {
    const { text, response } = await runLlmStream({
      streamParams: {
        ...params,
        abortSignal: params.abortSignal ?? ctx.opts.abortSignal,
      } as StreamTextParams,
      mode: 'progress',
      processorCtx: {
        emitStepProgress: (chunk) => ctx.emitStepProgress(chunk),
        bus: ctx.opts.eventBus,
      },
      ...llmValidationContext(ctx, 'streamText:progress'),
      llmDebug: llmDebugContext(ctx),
    })
    recordLlmTokenUsageFromOpts(
      ctx.opts,
      { source: 'streamText', stepId: ctx.stepId },
      await readStreamTextUsage(response),
    )
    return { text }
  })
}

export async function streamLlmObjectToStepProgress<T>(params: {
  ctx: AgentStepContext
  streamParams: StreamTextParams
}): Promise<{ text: string; output: T }> {
  const { ctx, streamParams } = params
  return withLlmRetry(stepRetryContext(ctx), 'streamObject:progress', async () => {
    const { text, output, response } = await runLlmStream({
      streamParams: {
        ...streamParams,
        abortSignal: streamParams.abortSignal ?? ctx.opts.abortSignal,
      } as StreamTextParams,
      mode: 'progress',
      processorCtx: {
        emitStepProgress: (chunk) => ctx.emitStepProgress(chunk),
        bus: ctx.opts.eventBus,
      },
      ...llmValidationContext(ctx, 'streamObject:progress'),
      llmDebug: llmDebugContext(ctx),
    })
    recordLlmTokenUsageFromOpts(
      ctx.opts,
      { source: 'streamObject', stepId: ctx.stepId },
      await readStreamTextUsage(response),
    )
    return {
      text,
      output: (output ?? (await response.output)) as T,
    }
  })
}

export async function runLlmObjectSilent<T>(params: {
  ctx: AgentStepContext
  streamParams: StreamTextParams
  usageSource?: string
}): Promise<{ output: T }> {
  const { ctx, streamParams, usageSource = 'streamObjectSilent' } = params
  return withLlmRetry(stepRetryContext(ctx), 'streamObject:silent', async () => {
    const { output, response } = await runLlmStream({
      streamParams: {
        ...streamParams,
        abortSignal: streamParams.abortSignal ?? ctx.opts.abortSignal,
      } as StreamTextParams,
      mode: 'silent',
      ...llmValidationContext(ctx, 'streamObject:silent'),
      llmDebug: llmDebugContext(ctx),
    })
    recordLlmTokenUsageFromOpts(
      ctx.opts,
      { source: usageSource, stepId: ctx.stepId },
      await readStreamTextUsage(response),
    )
    return { output: (output ?? (await response.output)) as T }
  })
}
