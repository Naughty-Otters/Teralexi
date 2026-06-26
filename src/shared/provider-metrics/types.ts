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
  datetime: string
  provider: string
  modelType?: string | null
  sessionId: string
  messageId: string
  runId?: string | null
  agentId: string
  parentRunId?: string | null
  source?: string | null
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
  userId: string
  inputTokenDetails: InputTokenDetailsInput
  outputTokenDetails: OutputTokenDetailsInput
}
