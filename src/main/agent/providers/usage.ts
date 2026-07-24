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

function emptyUsage(): LanguageModelUsage {
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

function sumUsage(usages: LanguageModelUsage[]): LanguageModelUsage {
  let inputTokens = 0
  let outputTokens = 0
  for (const u of usages) {
    inputTokens += Number(u.inputTokens ?? 0)
    outputTokens += Number(u.outputTokens ?? 0)
  }
  return {
    ...emptyUsage(),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

type StepPerformanceLike = {
  stepTimeMs?: number
  responseTimeMs?: number
  timeToFirstOutputMs?: number
  toolExecutionMs?: Readonly<Record<string, number>> | Record<string, number>
  outputTokensPerSecond?: number
  inputTokensPerSecond?: number
  effectiveOutputTokensPerSecond?: number
  effectiveTotalTokensPerSecond?: number
}

type UsageWithPerformance = LanguageModelUsage & Record<string, unknown>

function mergePerformanceIntoUsage(
  usage: LanguageModelUsage,
  performance: StepPerformanceLike | undefined,
): LanguageModelUsage {
  if (!performance) return usage
  const merged: UsageWithPerformance = { ...usage }
  const copyNumber = (key: keyof StepPerformanceLike) => {
    const value = performance[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      merged[key] = value
    }
  }
  copyNumber('stepTimeMs')
  copyNumber('responseTimeMs')
  copyNumber('timeToFirstOutputMs')
  copyNumber('outputTokensPerSecond')
  copyNumber('inputTokensPerSecond')
  copyNumber('effectiveOutputTokensPerSecond')
  copyNumber('effectiveTotalTokensPerSecond')
  if (
    performance.toolExecutionMs &&
    typeof performance.toolExecutionMs === 'object'
  ) {
    merged.toolExecutionMs = { ...performance.toolExecutionMs }
  }
  return merged
}

async function readResultPerformance(result: {
  finalStep?: PromiseLike<{ performance?: StepPerformanceLike }>
  steps?: PromiseLike<Array<{ performance?: StepPerformanceLike }>>
}): Promise<StepPerformanceLike | undefined> {
  if (result.finalStep) {
    try {
      const step = await result.finalStep
      if (step?.performance) return step.performance
    } catch {
      /* fall through */
    }
  }
  if (result.steps) {
    try {
      const steps = await result.steps
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i]?.performance) return steps[i]!.performance
      }
    } catch {
      /* ignore */
    }
  }
  return undefined
}

export async function readStreamTextUsage(result: {
  totalUsage?: PromiseLike<LanguageModelUsage>
  usage: PromiseLike<LanguageModelUsage>
  finalStep?: PromiseLike<{
    usage?: LanguageModelUsage
    performance?: StepPerformanceLike
  }>
  steps?: PromiseLike<
    Array<{ usage?: LanguageModelUsage; performance?: StepPerformanceLike }>
  >
}): Promise<LanguageModelUsage> {
  let usage = emptyUsage()
  try {
    if (result.totalUsage) {
      const total = await result.totalUsage
      if (hasTokenCounts(total)) usage = total
    }
    if (!hasTokenCounts(usage)) {
      const last = await result.usage
      if (hasTokenCounts(last)) usage = last
    }
  } catch {
    /* fall through to step aggregation */
  }

  if (!hasTokenCounts(usage) && result.steps) {
    try {
      const steps = await result.steps
      const stepUsages = steps
        .map((step) => step.usage)
        .filter((stepUsage): stepUsage is LanguageModelUsage =>
          hasTokenCounts(stepUsage),
        )
      if (stepUsages.length > 0) usage = sumUsage(stepUsages)
    } catch {
      /* ignore */
    }
  }

  const performance = await readResultPerformance(result)
  return mergePerformanceIntoUsage(usage, performance)
}

export async function readAgentTotalUsage(result: {
  totalUsage?: PromiseLike<LanguageModelUsage>
  usage?: PromiseLike<LanguageModelUsage>
  finalStep?: PromiseLike<{ performance?: StepPerformanceLike }>
  steps?: PromiseLike<Array<{ performance?: StepPerformanceLike }>>
}): Promise<LanguageModelUsage | undefined> {
  let usage: LanguageModelUsage | undefined
  if (result.totalUsage) {
    usage = await result.totalUsage
  } else if (result.usage) {
    usage = await result.usage
  }
  if (!usage) return undefined
  const performance = await readResultPerformance(result)
  return mergePerformanceIntoUsage(usage, performance)
}
