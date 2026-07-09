import { getTeralexiAccountGoogleIdToken } from '@main/services/google-account-oauth'
import {
  getTeralexiBaseApiUrl,
  getTeralexiGraphqlUrl,
} from '@main/services/teralexi-platform-config'
import { getTeralexiServerAccessToken } from '@main/services/teralexi-server-auth'
import type {
  AddProviderMetricInput,
  ProviderMetricType,
} from '@shared/provider-metrics/types'
import {
  hasProviderMetricUsageData,
  mapProviderMetricFieldsFromUsage,
} from '@shared/provider-metrics/usage-mapper'
import type { LanguageModelUsage } from '@teralexi-ai'
import { createLogger } from '@main/logger'
import { ENTITLEMENT_FEATURES } from '@shared/subscription/entitlement-types'
import { isEntitlementFeatureAllowed } from './entitlement-session'

const log = createLogger('services.provider-metrics-reporter')

export const PROVIDER_METRICS_GRAPHQL_URL_KEY = 'app.metrics.graphqlUrl'

const ADD_PROVIDER_METRIC_MUTATION = `
mutation AddProviderMetric($input: AddProviderMetricInput!) {
  addProviderMetric(input: $input) {
    id
    userId
    datetime
    provider
    modelType
    sessionId
    messageId
    runId
    agentId
    parentRunId
    source
    inputTokens
    inputTokenDetails {
      cacheReadTokens
      cacheWriteTokens
      noCacheTokens
    }
    outputTokens
    outputTokenDetails {
      reasoningTokens
      textTokens
    }
    effectiveOutputTokensPerSecond
    outputTokensPerSecond
    inputTokensPerSecond
    effectiveTotalTokensPerSecond
    stepTimeMs
    responseTimeMs
    toolExecutionMs
    timeToFirstOutputMs
  }
}
`

type GraphQlResponse = {
  data?: { addProviderMetric?: ProviderMetricType }
  errors?: Array<{ message?: string }>
}

export function getProviderMetricsGraphqlUrl(): string {
  return getTeralexiGraphqlUrl()
}

export function getProviderMetricsApiBaseUrl(): string {
  return getTeralexiBaseApiUrl()
}

export function buildAddProviderMetricInput(args: {
  datetime: string
  provider: string | null | undefined
  modelType?: string | null | undefined
  sessionId: string | null | undefined
  messageId: string | null | undefined
  agentId: string | null | undefined
  runId?: string | null | undefined
  parentRunId?: string | null | undefined
  source?: string | null | undefined
  usage: LanguageModelUsage | undefined | null
}): AddProviderMetricInput | null {
  const sessionId = args.sessionId?.trim() ?? ''
  const messageId = args.messageId?.trim() ?? ''
  const provider = args.provider?.trim() ?? ''
  const modelType = args.modelType?.trim() ?? ''
  const agentId = args.agentId?.trim() || 'unknown'
  const runId = args.runId?.trim() ?? ''
  const parentRunId = args.parentRunId?.trim() ?? ''
  const source = args.source?.trim() ?? ''

  if (!sessionId || !messageId) return null
  if (!hasProviderMetricUsageData(args.usage)) return null

  return {
    datetime: args.datetime,
    provider: provider || 'unknown',
    ...(modelType ? { modelType } : {}),
    sessionId,
    messageId,
    agentId,
    ...(runId ? { runId } : {}),
    ...(parentRunId ? { parentRunId } : {}),
    ...(source ? { source } : {}),
    ...mapProviderMetricFieldsFromUsage(args.usage),
  }
}

export async function reportProviderMetric(
  input: AddProviderMetricInput,
  serverAccessToken?: string | null,
): Promise<ProviderMetricType> {
  const graphqlUrl = getProviderMetricsGraphqlUrl()
  if (!graphqlUrl) {
    throw new Error('Provider metrics GraphQL URL is not configured')
  }

  const apiBaseUrl = getProviderMetricsApiBaseUrl()
  if (
    apiBaseUrl &&
    !isEntitlementFeatureAllowed(ENTITLEMENT_FEATURES.METRICS_WRITE)
  ) {
    throw new Error('Provider metrics are not included in the current plan')
  }
  const bearerToken =
    serverAccessToken?.trim() ||
    (await getTeralexiServerAccessToken(apiBaseUrl))
  if (!bearerToken) {
    throw new Error('Teralexi server access token is not available')
  }

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      query: ADD_PROVIDER_METRIC_MUTATION,
      variables: { input },
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as GraphQlResponse
  if (!response.ok) {
    const message =
      payload.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
      `HTTP ${response.status}`
    throw new Error(message)
  }

  if (payload.errors?.length) {
    throw new Error(
      payload.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join('; ') || 'GraphQL request failed',
    )
  }

  const metric = payload.data?.addProviderMetric
  if (!metric) {
    throw new Error('GraphQL response missing addProviderMetric payload')
  }

  return metric
}

export function reportProviderMetricAsync(args: {
  datetime: string
  provider: string | null | undefined
  modelType?: string | null | undefined
  sessionId: string | null | undefined
  messageId: string | null | undefined
  agentId: string | null | undefined
  runId?: string | null | undefined
  parentRunId?: string | null | undefined
  source?: string | null | undefined
  usage: LanguageModelUsage | undefined | null
}): void {
  const graphqlUrl = getProviderMetricsGraphqlUrl()
  if (!graphqlUrl) return
  if (!getTeralexiAccountGoogleIdToken()) return

  const input = buildAddProviderMetricInput(args)
  if (!input) return

  void reportProviderMetric(input).catch((error) => {
    log.warn('Failed to report provider metric', {
      provider: input.provider,
      modelType: input.modelType,
      sessionId: input.sessionId,
      messageId: input.messageId,
      runId: input.runId,
      agentId: input.agentId,
      parentRunId: input.parentRunId,
      source: input.source,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      err: error,
    })
  })
}
