import type { LanguageModelUsage } from '@teralexi-ai'
import type { AgentStepContext } from '../context'
import type { AgentLlmStage } from '@shared/agent/stage-llm-settings'
import type {
  AgentResponseOpts,
  AgentStepId,
  ProviderCredentials,
  ProviderType,
} from '../types'
import { createModelForProvider } from './adapters'
import type { StreamTextParams } from './stream'
import {
  parseAgentStageLlmSettings,
  resolveStageLlmChoice,
} from '@shared/agent/stage-llm-settings'
import {
  readStreamTextUsage,
  readAgentTotalUsage,
  recordLlmTokenUsage,
  usageToCounts,
} from './usage'
import {
  runLlmObjectSilent,
  streamLlmObjectToStepProgress,
  streamLlmTextToStepProgress,
} from './stream'

/**
 * LLM provider + streaming surface for agent flow clients.
 * Obtain via {@link AgentFlowContext.providers} / {@link AgentStepContext.providers}.
 */
export class ProviderContext {
  constructor(
    public readonly opts: AgentResponseOpts,
    public readonly model: unknown,
  ) {}

  static createModelForOpts(opts: AgentResponseOpts): unknown {
    return createModelForProvider(opts.provider, opts.model, opts)
  }

  static createModel(
    provider: ProviderType,
    modelId: string,
    creds: ProviderCredentials,
  ): unknown {
    return createModelForProvider(provider, modelId, creds)
  }

  streamTextToStepProgress(
    stepCtx: AgentStepContext,
    params: StreamTextParams,
  ): Promise<{ text: string }> {
    return streamLlmTextToStepProgress(stepCtx, {
      ...params,
      model: params.model ?? this.model,
    })
  }

  streamObjectToStepProgress<T>(
    stepCtx: AgentStepContext,
    streamParams: StreamTextParams,
  ): Promise<{ text: string; output: T }> {
    return streamLlmObjectToStepProgress<T>({
      ctx: stepCtx,
      streamParams: {
        ...streamParams,
        model: streamParams.model ?? this.model,
      },
    })
  }

  runObjectSilent<T>(
    stepCtx: AgentStepContext,
    streamParams: StreamTextParams,
    usageSource?: string,
  ): Promise<{ output: T }> {
    return runLlmObjectSilent<T>({
      ctx: stepCtx,
      streamParams: {
        ...streamParams,
        model: streamParams.model ?? this.model,
      },
      usageSource,
    })
  }

  recordTokenUsageFromOpts(
    meta: {
      source: string
      stepId?: AgentStepId | string | null
      agentId?: string | null
      stage?: AgentLlmStage
    },
    usage: LanguageModelUsage | undefined | null,
  ): void {
    const choice = meta.stage
      ? resolveStageLlmChoice(
          this.opts.stageLlm ??
            parseAgentStageLlmSettings({
              provider: this.opts.provider,
              model: this.opts.model,
              routingMode: 'unified',
            }),
          meta.stage,
        )
      : null
    recordLlmTokenUsage({
      userId: this.opts.userId,
      conversationId: this.opts.conversationId ?? null,
      agentId: meta.agentId ?? this.opts.agentId ?? null,
      assistantMessageId: this.opts.assistantMessageId ?? null,
      stepId: meta.stepId ?? null,
      source: meta.source,
      provider: choice?.provider ?? this.opts.provider,
      model: choice?.model ?? this.opts.model,
      usage,
    })
  }

  readStreamTextUsage(
    result: Parameters<typeof readStreamTextUsage>[0],
  ): Promise<LanguageModelUsage> {
    return readStreamTextUsage(result)
  }

  readAgentTotalUsage(
    result: Parameters<typeof readAgentTotalUsage>[0],
  ): Promise<LanguageModelUsage | undefined> {
    return readAgentTotalUsage(result)
  }

  usageToCounts(usage: LanguageModelUsage | undefined | null) {
    return usageToCounts(usage)
  }
}
