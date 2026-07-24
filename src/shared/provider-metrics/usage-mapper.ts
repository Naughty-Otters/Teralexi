import type { LanguageModelUsage } from '@teralexi-ai'
import type {
  AddProviderMetricInput,
  InputTokenDetailsInput,
  OutputTokenDetailsInput,
} from './types'

type UsageLike = LanguageModelUsage & Record<string, unknown>

function asInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.trunc(parsed)
}

function asFloat(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function pickDefined<T extends Record<string, unknown>>(source: T): Partial<T> {
  const picked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) {
      picked[key] = value
    }
  }
  return picked as Partial<T>
}

function readUsageField(usage: UsageLike, key: string): unknown {
  if (key in usage) return usage[key]
  const raw = usage.raw
  if (raw && typeof raw === 'object' && key in raw) {
    return (raw as Record<string, unknown>)[key]
  }
  return undefined
}

function mapInputTokenDetails(
  usage: UsageLike,
): InputTokenDetailsInput | undefined {
  const details = usage.inputTokenDetails
  const mapped = pickDefined({
    cacheReadTokens:
      asInt(details?.cacheReadTokens) ??
      asInt(readUsageField(usage, 'cachedInputTokens')) ??
      asInt(readUsageField(usage, 'cacheReadTokens')),
    cacheWriteTokens:
      asInt(details?.cacheWriteTokens) ??
      asInt(readUsageField(usage, 'cacheWriteTokens')),
    noCacheTokens:
      asInt(details?.noCacheTokens) ??
      asInt(readUsageField(usage, 'noCacheTokens')),
  })
  return Object.keys(mapped).length > 0 ? mapped : undefined
}

function mapOutputTokenDetails(
  usage: UsageLike,
): OutputTokenDetailsInput | undefined {
  const details = usage.outputTokenDetails
  const mapped = pickDefined({
    reasoningTokens:
      asInt(details?.reasoningTokens) ??
      asInt(readUsageField(usage, 'reasoningTokens')),
    textTokens:
      asInt(details?.textTokens) ?? asInt(readUsageField(usage, 'textTokens')),
  })
  return Object.keys(mapped).length > 0 ? mapped : undefined
}

function mapToolExecutionMs(
  usage: UsageLike,
): Record<string, unknown> | undefined {
  const rawValue = readUsageField(usage, 'toolExecutionMs')
  if (rawValue == null) return undefined
  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue as Record<string, unknown>
  }
  return undefined
}

export function hasProviderMetricUsageData(
  usage: LanguageModelUsage | undefined | null,
): boolean {
  if (!usage) return false
  const inputTokens = asInt(usage.inputTokens) ?? 0
  const outputTokens = asInt(usage.outputTokens) ?? 0
  const totalTokens = asInt(usage.totalTokens) ?? inputTokens + outputTokens
  if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) return true

  const extended = mapProviderMetricFieldsFromUsage(usage)
  return (
    extended.stepTimeMs != null ||
    extended.responseTimeMs != null ||
    extended.timeToFirstOutputMs != null ||
    extended.toolExecutionMs != null
  )
}

export function mapProviderMetricFieldsFromUsage(
  usage: LanguageModelUsage | undefined | null,
): Omit<
  AddProviderMetricInput,
  'datetime' | 'provider' | 'sessionId' | 'messageId'
> {
  if (!usage) return {}

  const usageLike = usage as UsageLike
  const inputTokens = asInt(usageLike.inputTokens)
  const outputTokens = asInt(usageLike.outputTokens)

  return pickDefined({
    inputTokens,
    inputTokenDetails: mapInputTokenDetails(usageLike),
    outputTokens,
    outputTokenDetails: mapOutputTokenDetails(usageLike),
    effectiveOutputTokensPerSecond: asFloat(
      readUsageField(usageLike, 'effectiveOutputTokensPerSecond'),
    ),
    outputTokensPerSecond: asFloat(
      readUsageField(usageLike, 'outputTokensPerSecond'),
    ),
    inputTokensPerSecond: asFloat(
      readUsageField(usageLike, 'inputTokensPerSecond'),
    ),
    effectiveTotalTokensPerSecond: asFloat(
      readUsageField(usageLike, 'effectiveTotalTokensPerSecond'),
    ),
    stepTimeMs: asInt(readUsageField(usageLike, 'stepTimeMs')),
    responseTimeMs: asInt(readUsageField(usageLike, 'responseTimeMs')),
    toolExecutionMs: mapToolExecutionMs(usageLike),
    timeToFirstOutputMs: asInt(readUsageField(usageLike, 'timeToFirstOutputMs')),
  })
}
