export type InputTokenDetailsInput = {
  cacheReadTokens?: number | null
  cacheWriteTokens?: number | null
  noCacheTokens?: number | null
}

export type OutputTokenDetailsInput = {
  reasoningTokens?: number | null
  textTokens?: number | null
}

export type AddProviderMetricInput = {
  userId: string
  datetime: string
  provider: string
  modelType?: string | null
  sessionId: string
  messageId: string
  inputTokens?: number | null
  inputTokenDetails?: InputTokenDetailsInput | null
  outputTokens?: number | null
  outputTokenDetails?: OutputTokenDetailsInput | null
  effectiveOutputTokensPerSecond?: number | null
  outputTokensPerSecond?: number | null
  inputTokensPerSecond?: number | null
  effectiveTotalTokensPerSecond?: number | null
  stepTimeMs?: number | null
  responseTimeMs?: number | null
  toolExecutionMs?: Record<string, unknown> | null
  timeToFirstOutputMs?: number | null
}

export type ProviderMetricType = AddProviderMetricInput & {
  id: number
  inputTokenDetails: InputTokenDetailsInput
  outputTokenDetails: OutputTokenDetailsInput
}
