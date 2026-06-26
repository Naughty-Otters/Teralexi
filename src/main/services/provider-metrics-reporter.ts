import { getSystemPropValue } from '@config/system-prop'
import { createLogger } from '@main/logger'
import { getOpenFdeAccountGoogleIdToken } from '@main/services/google-account-oauth'
import {
  getOpenFdeServerAccessToken,
  resolveMetricsApiBaseUrl,
} from '@main/services/openfde-server-auth'
import type {
  AddProviderMetricInput,
  ProviderMetricType,
} from '@shared/provider-metrics/types'
import {
  hasProviderMetricUsageData,
  mapProviderMetricFieldsFromUsage,
} from '@shared/provider-metrics/usage-mapper'
import type { LanguageModelUsage } from '@openfde-ai'

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
  return getSystemPropValue(PROVIDER_METRICS_GRAPHQL_URL_KEY, '').trim()
}

export function getProviderMetricsApiBaseUrl(): string {
  return resolveMetricsApiBaseUrl(getProviderMetricsGraphqlUrl())
}

export function buildAddProviderMetricInput(args: {
  datetime: string
  provider: string | null | undefined
  modelType?: string | null | undefined
  sessionId: string | null | undefined
  messageId: string | null | undefined
  usage: LanguageModelUsage | undefined | null
}): AddProviderMetricInput | null {
  const sessionId = args.sessionId?.trim() ?? ''
  const messageId = args.messageId?.trim() ?? ''
  const provider = args.provider?.trim() ?? ''
  const modelType = args.modelType?.trim() ?? ''

  if (!sessionId || !messageId) return null
  if (!hasProviderMetricUsageData(args.usage)) return null

  return {
    datetime: args.datetime,
    provider: provider || 'unknown',
    ...(modelType ? { modelType } : {}),
    sessionId,
    messageId,
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

  const apiBaseUrl = resolveMetricsApiBaseUrl(graphqlUrl)
  const bearerToken =
    serverAccessToken?.trim() ||
    (await getOpenFdeServerAccessToken(apiBaseUrl))
  if (!bearerToken) {
    throw new Error('OpenFDE server access token is not available')
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
  usage: LanguageModelUsage | undefined | null
}): void {
  const graphqlUrl = getProviderMetricsGraphqlUrl()
  if (!graphqlUrl) return
  if (!getOpenFdeAccountGoogleIdToken()) return

  const input = buildAddProviderMetricInput(args)
  if (!input) return

  void reportProviderMetric(input).catch((error) => {
    log.warn('Failed to report provider metric', {
      provider: input.provider,
      modelType: input.modelType,
      sessionId: input.sessionId,
      messageId: input.messageId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      err: error,
    })
  })
}
