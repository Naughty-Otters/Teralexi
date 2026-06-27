import { getSystemPropValues } from '@config/system-prop'
import { createLogger } from '@main/logger'
import { loadAgentRunCredentials } from '@main/agent/utils/agent-run-context'
import {
  EDITOR_AI_COMPLETION_PROP_KEYS,
  parseEditorAiCompletionSettings,
  resolveEditorAiCompletionModel,
  type EditorAiCompletionProvider,
} from '@shared/editor/editor-ai-completion-settings'
import {
  buildChatInfillPrompt,
  buildFimPrompt,
  DEFAULT_FIM_STOP_TOKENS,
  isFimCapableModel,
  OPENAI_COMPATIBLE_API_STOP_TOKENS,
  sanitizeChatInfillCompletion,
  sanitizeFimCompletion,
} from '@shared/editor/fim-prompt'
import type { OpenAiCompatibleProviderId } from '@shared/agent/llm-provider-registry'
import type { ProviderCredentials } from '@main/agent/types'

const log = createLogger('editor.ai-completion')

export type EditorAiCompleteRequest = {
  conversationId: string
  prefix: string
  suffix: string
  languageId: string
  relativePath: string
}

export type EditorAiCompleteResult = {
  ok: boolean
  completion?: string
  error?: string
}

type CompletionStrategy = 'fim-completions' | 'chat'

type FimEndpoint =
  | {
      strategy: 'fim-completions'
      kind: 'ollama'
      url: string
    }
  | {
      strategy: 'fim-completions'
      kind: 'openai-completions'
      url: string
      headers: Record<string, string>
    }

type ChatEndpoint =
  | {
      strategy: 'chat'
      kind: 'ollama-chat'
      url: string
    }
  | {
      strategy: 'chat'
      kind: 'openai-chat'
      url: string
      headers: Record<string, string>
    }

type CompletionEndpoint = FimEndpoint | ChatEndpoint

const inflightByConversation = new Map<string, AbortController>()

function abortInflight(conversationId: string): void {
  inflightByConversation.get(conversationId)?.abort()
  inflightByConversation.delete(conversationId)
}

function resolveCompletionStrategy(
  provider: EditorAiCompletionProvider,
  model: string,
): CompletionStrategy {
  if (provider === 'ollama' || provider === 'llamacpp') {
    return 'fim-completions'
  }
  if (isFimCapableModel(model)) {
    return 'fim-completions'
  }
  return 'chat'
}

function resolveOpenAiCompatibleChatEndpoint(
  providerId: OpenAiCompatibleProviderId,
  creds: ProviderCredentials,
): ChatEndpoint | null {
  const { apiKey, baseURL } = creds.openAiCompatible[providerId]
  if (!apiKey.trim()) return null
  const normalizedBase = baseURL.replace(/\/+$/, '')
  return {
    strategy: 'chat',
    kind: 'openai-chat',
    url: `${normalizedBase}/chat/completions`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }
}

function resolveOpenAiCompatibleFimEndpoint(
  providerId: OpenAiCompatibleProviderId,
  creds: ProviderCredentials,
): FimEndpoint | null {
  const { apiKey, baseURL } = creds.openAiCompatible[providerId]
  if (!apiKey.trim()) return null
  const normalizedBase = baseURL.replace(/\/+$/, '')
  return {
    strategy: 'fim-completions',
    kind: 'openai-completions',
    url: `${normalizedBase}/completions`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }
}

function resolveFimEndpoint(
  provider: EditorAiCompletionProvider,
  creds: ProviderCredentials,
): FimEndpoint | null {
  switch (provider) {
    case 'ollama':
      return {
        strategy: 'fim-completions',
        kind: 'ollama',
        url: `${creds.ollamaBaseURL.replace(/\/+$/, '')}/api/generate`,
      }
    case 'llamacpp': {
      const apiKey = creds.llamacppApiKey.trim() || 'not-needed'
      const base = creds.llamacppBaseURL.replace(/\/+$/, '')
      return {
        strategy: 'fim-completions',
        kind: 'openai-completions',
        url: `${base}/completions`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    }
    case 'openai': {
      if (!creds.openaiApiKey.trim()) return null
      const base = creds.openaiBaseURL.replace(/\/+$/, '')
      return {
        strategy: 'fim-completions',
        kind: 'openai-completions',
        url: `${base}/completions`,
        headers: {
          Authorization: `Bearer ${creds.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    }
    case 'deepseek': {
      if (!creds.deepseekApiKey.trim()) return null
      const base = creds.deepseekApiUrl.replace(/\/+$/, '')
      return {
        strategy: 'fim-completions',
        kind: 'openai-completions',
        url: `${base}/completions`,
        headers: {
          Authorization: `Bearer ${creds.deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    }
    case 'qwen':
      return resolveOpenAiCompatibleFimEndpoint('qwen', creds)
    case 'moonshot':
      return resolveOpenAiCompatibleFimEndpoint('moonshot', creds)
    default:
      return null
  }
}

function resolveChatEndpoint(
  provider: EditorAiCompletionProvider,
  creds: ProviderCredentials,
): ChatEndpoint | null {
  switch (provider) {
    case 'ollama':
      return {
        strategy: 'chat',
        kind: 'ollama-chat',
        url: `${creds.ollamaBaseURL.replace(/\/+$/, '')}/api/chat`,
      }
    case 'llamacpp': {
      const apiKey = creds.llamacppApiKey.trim() || 'not-needed'
      const base = creds.llamacppBaseURL.replace(/\/+$/, '')
      return {
        strategy: 'chat',
        kind: 'openai-chat',
        url: `${base}/chat/completions`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    }
    case 'openai': {
      if (!creds.openaiApiKey.trim()) return null
      const base = creds.openaiBaseURL.replace(/\/+$/, '')
      return {
        strategy: 'chat',
        kind: 'openai-chat',
        url: `${base}/chat/completions`,
        headers: {
          Authorization: `Bearer ${creds.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    }
    case 'deepseek': {
      if (!creds.deepseekApiKey.trim()) return null
      const base = creds.deepseekApiUrl.replace(/\/+$/, '')
      return {
        strategy: 'chat',
        kind: 'openai-chat',
        url: `${base}/chat/completions`,
        headers: {
          Authorization: `Bearer ${creds.deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    }
    case 'qwen':
      return resolveOpenAiCompatibleChatEndpoint('qwen', creds)
    case 'moonshot':
      return resolveOpenAiCompatibleChatEndpoint('moonshot', creds)
    default:
      return null
  }
}

function resolveCompletionEndpoint(
  provider: EditorAiCompletionProvider,
  model: string,
  creds: ProviderCredentials,
): CompletionEndpoint | null {
  const strategy = resolveCompletionStrategy(provider, model)
  if (strategy === 'chat') {
    return resolveChatEndpoint(provider, creds)
  }
  return resolveFimEndpoint(provider, creds)
}

async function requestOllamaCompletion(
  endpoint: Extract<FimEndpoint, { kind: 'ollama' }>,
  model: string,
  prompt: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      raw: true,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.2,
        stop: [...DEFAULT_FIM_STOP_TOKENS],
      },
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Ollama completion failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const payload = (await response.json()) as { response?: string }
  return payload.response ?? ''
}

async function requestOllamaChatCompletion(
  endpoint: Extract<ChatEndpoint, { kind: 'ollama-chat' }>,
  model: string,
  prefix: string,
  suffix: string,
  languageId: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: buildChatInfillPrompt(prefix, suffix, languageId),
        },
      ],
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.2,
      },
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Ollama chat completion failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const payload = (await response.json()) as {
    message?: { content?: string }
  }
  return payload.message?.content ?? ''
}

async function requestOpenAiCompatibleCompletion(
  endpoint: Extract<FimEndpoint, { kind: 'openai-completions' }>,
  model: string,
  prompt: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model,
      prompt,
      max_tokens: maxTokens,
      temperature: 0.2,
      stop: [...OPENAI_COMPATIBLE_API_STOP_TOKENS],
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Completion request failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const payload = (await response.json()) as {
    choices?: Array<{ text?: string }>
  }
  return payload.choices?.[0]?.text ?? ''
}

async function requestChatInfillCompletion(
  endpoint: Extract<ChatEndpoint, { kind: 'openai-chat' }>,
  model: string,
  prefix: string,
  suffix: string,
  languageId: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: buildChatInfillPrompt(prefix, suffix, languageId),
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Chat completion request failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return payload.choices?.[0]?.message?.content ?? ''
}

async function requestFimCompletion(
  endpoint: FimEndpoint,
  model: string,
  prefix: string,
  suffix: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const prompt = buildFimPrompt(prefix, suffix)
  if (endpoint.kind === 'ollama') {
    return requestOllamaCompletion(endpoint, model, prompt, maxTokens, signal)
  }
  return requestOpenAiCompatibleCompletion(
    endpoint,
    model,
    prompt,
    maxTokens,
    signal,
  )
}

async function requestChatCompletion(
  endpoint: ChatEndpoint,
  model: string,
  prefix: string,
  suffix: string,
  languageId: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  if (endpoint.kind === 'ollama-chat') {
    return requestOllamaChatCompletion(
      endpoint,
      model,
      prefix,
      suffix,
      languageId,
      maxTokens,
      signal,
    )
  }
  return requestChatInfillCompletion(
    endpoint,
    model,
    prefix,
    suffix,
    languageId,
    maxTokens,
    signal,
  )
}

function sanitizeCompletion(
  strategy: CompletionStrategy,
  raw: string,
  suffix: string,
): string {
  return strategy === 'chat'
    ? sanitizeChatInfillCompletion(raw, suffix)
    : sanitizeFimCompletion(raw, suffix)
}

export async function completeEditorAi(
  request: EditorAiCompleteRequest,
): Promise<EditorAiCompleteResult> {
  const conversationId = request.conversationId?.trim()
  if (!conversationId) {
    return { ok: false, error: 'conversationId is required.' }
  }

  const propValues = getSystemPropValues([
    ...Object.values(EDITOR_AI_COMPLETION_PROP_KEYS),
  ])
  const settings = parseEditorAiCompletionSettings(propValues)
  if (!settings.enabled) {
    return { ok: false, error: 'AI completion is disabled.' }
  }

  const creds = loadAgentRunCredentials()
  const model = resolveEditorAiCompletionModel(settings)
  const provider = settings.provider
  const primaryStrategy = resolveCompletionStrategy(provider, model)
  const chatEndpoint = resolveChatEndpoint(provider, creds)
  const primaryEndpoint = resolveCompletionEndpoint(provider, model, creds)

  if (!primaryEndpoint) {
    return {
      ok: false,
      error: `No credentials configured for ${provider}.`,
    }
  }

  abortInflight(conversationId)
  const controller = new AbortController()
  inflightByConversation.set(conversationId, controller)

  const runStrategy = async (
    strategy: CompletionStrategy,
    endpoint: CompletionEndpoint,
  ): Promise<string> => {
    if (strategy === 'chat') {
      return requestChatCompletion(
        endpoint as ChatEndpoint,
        model,
        request.prefix,
        request.suffix,
        request.languageId,
        settings.maxTokens,
        controller.signal,
      )
    }
    return requestFimCompletion(
      endpoint as FimEndpoint,
      model,
      request.prefix,
      request.suffix,
      settings.maxTokens,
      controller.signal,
    )
  }

  try {
    let strategy = primaryStrategy
    let raw = ''

    try {
      raw = await runStrategy(strategy, primaryEndpoint)
    } catch (primaryErr) {
      if (controller.signal.aborted) throw primaryErr
      const canFallback =
        strategy === 'fim-completions' && chatEndpoint != null

      if (!canFallback) throw primaryErr

      const primaryMessage =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      log.info('FIM completion unavailable, falling back to chat', {
        provider,
        model,
        relativePath: request.relativePath,
        error: primaryMessage,
      })

      strategy = 'chat'
      raw = await requestChatCompletion(
        chatEndpoint,
        model,
        request.prefix,
        request.suffix,
        request.languageId,
        settings.maxTokens,
        controller.signal,
      )
    }

    const completion = sanitizeCompletion(strategy, raw, request.suffix)
    if (!completion) {
      return { ok: true, completion: '' }
    }

    return { ok: true, completion }
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: 'Request aborted.' }
    }
    const message = err instanceof Error ? err.message : String(err)
    log.warn('AI completion failed', {
      provider,
      model,
      strategy: primaryStrategy,
      relativePath: request.relativePath,
      error: message,
    })
    return { ok: false, error: message }
  } finally {
    if (inflightByConversation.get(conversationId) === controller) {
      inflightByConversation.delete(conversationId)
    }
  }
}

/** Visible for tests. */
export function __resolveCompletionEndpointForTest(
  provider: EditorAiCompletionProvider,
  model: string,
  creds: ProviderCredentials,
): CompletionEndpoint | null {
  return resolveCompletionEndpoint(provider, model, creds)
}

/** Visible for tests. */
export function __resolveFimEndpointForTest(
  provider: EditorAiCompletionProvider,
  creds: ProviderCredentials,
): FimEndpoint | null {
  return resolveFimEndpoint(provider, creds)
}

/** Visible for tests. */
export function __resolveChatEndpointForTest(
  provider: EditorAiCompletionProvider,
  creds: ProviderCredentials,
): ChatEndpoint | null {
  return resolveChatEndpoint(provider, creds)
}

/** Visible for tests. */
export function __resolveCompletionStrategyForTest(
  provider: EditorAiCompletionProvider,
  model: string,
): CompletionStrategy {
  return resolveCompletionStrategy(provider, model)
}

/** Visible for tests. */
export function __abortInflightForTest(conversationId: string): void {
  abortInflight(conversationId)
}
