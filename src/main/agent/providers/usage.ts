import type { LanguageModelUsage } from '@teralexi-ai'
import { getConversationStore } from '@main/services/conversation-store'
import { reportProviderMetricAsync } from '@main/services/provider-metrics-reporter'
import { randomShortUuid } from '@shared/utils/short-uuid'
import type { AgentResponseOpts, AgentStepId } from '../types'
import { getCurrentAgentRunScope } from '../run/run-scope'

export function usageToCounts(usage: LanguageModelUsage | undefined | null): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
} {
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  }
  const inputTokens = Number(usage.inputTokens ?? 0)
  const outputTokens = Number(usage.outputTokens ?? 0)
  const totalTokens = Number(usage.totalTokens ?? inputTokens + outputTokens)
  return { inputTokens, outputTokens, totalTokens }
}

function resolveMetricRunContext(overrides?: {
  runId?: string | null
  parentRunId?: string | null
}): { runId?: string; parentRunId?: string } {
  const scope = getCurrentAgentRunScope()
  const runId = overrides?.runId?.trim() || scope?.runId?.trim()
  const parentRunId = overrides?.parentRunId?.trim() || scope?.parentRunId?.trim()
  return {
    ...(runId ? { runId } : {}),
    ...(parentRunId ? { parentRunId } : {}),
  }
}

export function recordLlmTokenUsage(params: {
  userId: string
  conversationId?: string | null
  agentId?: string | null
  assistantMessageId?: string | null
  runId?: string | null
  parentRunId?: string | null
  stepId?: string | null
  source: string
  provider?: string | null
  model?: string | null
  usage: LanguageModelUsage | undefined | null
}): void {
  const counts = usageToCounts(params.usage)
  if (
    counts.totalTokens <= 0 &&
    counts.inputTokens <= 0 &&
    counts.outputTokens <= 0
  ) {
    return
  }

  getConversationStore().insertTokenUsage({
    id: randomShortUuid(),
    userId: params.userId,
    recordedAt: new Date().toISOString(),
    conversationId: params.conversationId ?? null,
    agentId: params.agentId ?? null,
    assistantMessageId: params.assistantMessageId ?? null,
    stepId: params.stepId ?? null,
    source: params.source,
    provider: params.provider ?? null,
    model: params.model ?? null,
    inputTokens: counts.inputTokens,
    outputTokens: counts.outputTokens,
    totalTokens: counts.totalTokens,
  })

  reportProviderMetricAsync({
    datetime: new Date().toISOString(),
    provider: params.provider,
    modelType: params.model,
    sessionId: params.conversationId,
    messageId: params.assistantMessageId,
    agentId: params.agentId,
    source: params.source,
    ...resolveMetricRunContext({
      runId: params.runId,
      parentRunId: params.parentRunId,
    }),
    usage: params.usage,
  })
}

export function recordLlmTokenUsageFromOpts(
  opts: AgentResponseOpts,
  meta: {
    source: string
    stepId?: AgentStepId | string | null
    agentId?: string | null
  },
  usage: LanguageModelUsage | undefined | null,
): void {
  recordLlmTokenUsage({
    userId: opts.userId,
    conversationId: opts.conversationId ?? null,
    agentId: meta.agentId ?? opts.agentId ?? null,
    assistantMessageId: opts.assistantMessageId ?? null,
    stepId: meta.stepId ?? null,
    source: meta.source,
    provider: opts.provider,
    model: opts.model,
    usage,
  })
}

function hasTokenCounts(usage: LanguageModelUsage | undefined | null): boolean {
  if (!usage) return false
  return (
    Number(usage.totalTokens ?? 0) > 0 ||
    Number(usage.inputTokens ?? 0) > 0 ||
    Number(usage.outputTokens ?? 0) > 0
  )
}

function sumUsage(usages: LanguageModelUsage[]): LanguageModelUsage {
  let inputTokens = 0
  let outputTokens = 0
  for (const u of usages) {
    inputTokens += Number(u.inputTokens ?? 0)
    outputTokens += Number(u.outputTokens ?? 0)
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
  }
}

export async function readStreamTextUsage(result: {
  totalUsage?: PromiseLike<LanguageModelUsage>
  usage: PromiseLike<LanguageModelUsage>
  steps?: PromiseLike<Array<{ usage?: LanguageModelUsage }>>
}): Promise<LanguageModelUsage> {
  try {
    if (result.totalUsage) {
      const total = await result.totalUsage
      if (hasTokenCounts(total)) return total
    }
    const last = await result.usage
    if (hasTokenCounts(last)) return last
  } catch {
    /* fall through to step aggregation */
  }

  if (result.steps) {
    try {
      const steps = await result.steps
      const stepUsages = steps
        .map((step) => step.usage)
        .filter((usage): usage is LanguageModelUsage => hasTokenCounts(usage))
      if (stepUsages.length > 0) return sumUsage(stepUsages)
    } catch {
      /* ignore */
    }
  }

  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
  }
}

export async function readAgentTotalUsage(result: {
  totalUsage?: PromiseLike<LanguageModelUsage>
  usage?: PromiseLike<LanguageModelUsage>
}): Promise<LanguageModelUsage | undefined> {
  if (result.totalUsage) {
    return result.totalUsage
  }
  if (result.usage) {
    return result.usage
  }
  return undefined
}
