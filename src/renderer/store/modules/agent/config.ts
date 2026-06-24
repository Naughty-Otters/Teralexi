import type { SkillTool } from '@main/skills/types'

export function buildToolPromptDescription(
  toolMeta: Omit<SkillTool, 'execute' | 'inputSchema'> & {
    inputSchema?: unknown
  },
): string {
  const promptNotes = [toolMeta.description]

  if (toolMeta.os) {
    promptNotes.push(
      `Operating system: ${toolMeta.os}. Use OS-appropriate commands and paths.`,
    )
  }
  const approvalRequired = toolMeta.needsApproval ?? false
  promptNotes.push(`Approval required: ${approvalRequired ? 'true' : 'false'}.`)

  return promptNotes.join('\n')
}

export const DEFAULT_RESPONSE_LANGUAGE = 'English'
export const DEFAULT_USER_ID = 'default'

/** @deprecated Use {@link CHAT_BOX_DISPLAY_MODE_STORAGE_KEY} from chat UI. */
export { ASSISTANT_STRUCTURED_DEBUG_STORAGE_KEY } from '@renderer/views/agent-chat/chatBoxDisplayMode'
export { CHAT_BOX_DISPLAY_MODE_STORAGE_KEY } from '@renderer/views/agent-chat/chatBoxDisplayMode'

export function withResponseLanguageInstruction(
  prompt: string | undefined,
  responseLanguage: string = DEFAULT_RESPONSE_LANGUAGE,
): string {
  const normalizedPrompt = (prompt ?? '').trim()
  const normalizedLanguage = responseLanguage.trim() || DEFAULT_RESPONSE_LANGUAGE
  const languageInstruction = `Respond in ${normalizedLanguage}. Keep all user-facing output in ${normalizedLanguage} unless the user explicitly asks for another language or a translation.`

  if (!normalizedPrompt) return languageInstruction
  if (normalizedPrompt.includes(languageInstruction)) return normalizedPrompt
  return `${normalizedPrompt}\n\n${languageInstruction}`
}

export const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
]

export const DEEPSEEK_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-chat',
  'deepseek-reasoner',
]

export const ZHIPU_MODELS = [
  'glm-4.6',
  'glm-4.5',
  'glm-4-plus',
  'glm-4-air',
  'glm-4-flash',
  'glm-4-long',
]

export const SYSTEM_PROP_KEYS = {
  ollamaBaseURL: 'settings.ollama.baseUrl',
  llamacppBaseURL: 'settings.llamacpp.baseUrl',
  llamacppApiKey: 'settings.llamacpp.apiKey',
  anthropicApiKey: 'settings.anthropic.apiKey',
  anthropicBaseURL: 'settings.anthropic.baseUrl',
  openaiApiKey: 'settings.openai.apiKey',
  openaiBaseURL: 'settings.openai.baseUrl',
  geminiApiKey: 'settings.gemini.apiKey',
  geminiBaseURL: 'settings.gemini.baseUrl',
  deepseekApiKey: 'settings.deepseek.apiKey',
  deepseekApiUrl: 'settings.deepseek.baseUrl',
  zhipuApiKey: 'settings.zhipu.apiKey',
  zhipuBaseURL: 'settings.zhipu.baseUrl',
} as const

/** When true, first-run LLM setup wizard is hidden even if no provider is configured. */
export const PROVIDER_SETUP_DISMISSED_KEY = 'settings.onboarding.llmDismissed'

/** When true, the user finished first-time ramp-up (LLM + agents + landing). */
export const ONBOARDING_COMPLETED_KEY = 'settings.onboarding.completed'

export function normalizeBaseURL(url: string, fallback: string): string {
  const value = url.trim()
  if (!value) return fallback
  return value.replace(/\/$/, '')
}

export async function setSystemConfigValue(
  key: string,
  value: string | number | boolean,
): Promise<void> {
  const channel = window.ipcRendererChannel?.SetSystemConfig
  if (!channel?.invoke) return
  await channel.invoke({ key, value })
}

export async function getSystemConfigValues(
  keys: string[],
): Promise<Record<string, string>> {
  const channel = window.ipcRendererChannel?.GetSystemConfigs
  if (!channel?.invoke) return {}
  return channel.invoke({ keys })
}

export function todoStatusIcon(status: 'pending' | 'in-progress' | 'completed' | 'failed'): string {
  switch (status) {
    case 'pending':     return '⏳'
    case 'in-progress': return '🔄'
    case 'completed':   return '✅'
    case 'failed':      return '❌'
    default:            return '•'
  }
}
