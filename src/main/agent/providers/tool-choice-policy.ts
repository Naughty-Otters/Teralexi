import type { ProviderType } from '../types'

/** Models that run in provider "thinking" mode and only accept auto/none tool_choice. */
const THINKING_MODE_MODEL_PATTERNS = [
  /deepseek-reasoner/i,
  /deepseek-v4/i,
] as const

export function modelRejectsRequiredToolChoice(
  provider: ProviderType | undefined,
  modelId: string | undefined,
): boolean {
  const model = modelId?.trim() ?? ''
  if (!model) return false

  if (THINKING_MODE_MODEL_PATTERNS.some((pattern) => pattern.test(model))) {
    return true
  }

  // OpenAI-compatible proxies may route to DeepSeek reasoner while provider stays "openai".
  if (provider === 'deepseek') {
    return /reasoner|thinking/i.test(model)
  }

  return false
}

export function resolveAgentToolChoice(
  requested: 'required' | 'auto' | 'none' | undefined,
  provider?: ProviderType,
  modelId?: string,
): 'required' | 'auto' | 'none' {
  const choice = requested ?? 'required'
  if (choice === 'required' && modelRejectsRequiredToolChoice(provider, modelId)) {
    return 'auto'
  }
  return choice
}
