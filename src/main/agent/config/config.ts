import type { SkillTool } from '@main/skills/types'
import { createLogger, traceFunction } from '@main/logger'
import { AGENT_DEFAULTS } from './constants'
import {
  buildResponseLanguageInstruction,
  TOOL_PROMPT_LLM,
} from '@main/agent/llm-constants'

const log = createLogger('agent.config')

function buildToolPromptDescriptionImpl(
  toolMeta: Omit<SkillTool, 'execute' | 'inputSchema'> & {
    inputSchema?: unknown
  },
): string {
  const promptNotes = [toolMeta.description]

  if (toolMeta.os) {
    promptNotes.push(
      TOOL_PROMPT_LLM.OS_LINE.replace('{os}', toolMeta.os),
    )
  }
  const approvalRequired = toolMeta.needsApproval ?? false
  promptNotes.push(
    TOOL_PROMPT_LLM.APPROVAL_LINE.replace(
      '{required}',
      approvalRequired ? 'true' : 'false',
    ),
  )

  return promptNotes.join('\n')
}

export const DEFAULT_RESPONSE_LANGUAGE = AGENT_DEFAULTS.RESPONSE_LANGUAGE
export const DEFAULT_USER_ID = AGENT_DEFAULTS.USER_ID

function withResponseLanguageInstructionImpl(
  prompt: string | undefined,
  responseLanguage: string = DEFAULT_RESPONSE_LANGUAGE,
): string {
  const normalizedPrompt = (prompt ?? '').trim()
  const normalizedLanguage =
    responseLanguage.trim() || DEFAULT_RESPONSE_LANGUAGE
  const languageInstruction = buildResponseLanguageInstruction(
    normalizedLanguage,
  )

  if (!normalizedPrompt) return languageInstruction
  if (normalizedPrompt.includes(languageInstruction)) return normalizedPrompt
  return `${normalizedPrompt}\n\n${languageInstruction}`
}

export const ANTHROPIC_MODELS = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
  'claude-haiku-4-5-latest',
]

export const DEEPSEEK_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-chat',
  'deepseek-reasoner',
]

export const XAI_MODELS = [
  'grok-3',
  'grok-3-mini',
  'grok-2-1212',
  'grok-2-vision-1212',
]

export const ZHIPU_MODELS = [
  'glm-5.2',
  'glm-5.1',
  'glm-5-Turbo',
  'glm-5',
  'glm-4.7',
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
  xaiApiKey: 'settings.xai.apiKey',
  xaiBaseURL: 'settings.xai.baseUrl',
  zhipuApiKey: 'settings.zhipu.apiKey',
  zhipuBaseURL: 'settings.zhipu.baseUrl',
} as const

function normalizeBaseURLImpl(url: string, fallback: string): string {
  const value = url.trim()
  if (!value) return fallback
  return value.replace(/\/$/, '')
}

function todoStatusIconImpl(
  status: 'pending' | 'in-progress' | 'completed' | 'failed',
): string {
  switch (status) {
    case 'pending':
      return '⏳'
    case 'in-progress':
      return '🔄'
    case 'completed':
      return '✅'
    case 'failed':
      return '❌'
    default:
      return '•'
  }
}

export const buildToolPromptDescription = traceFunction(
  log,
  'buildToolPromptDescription',
  buildToolPromptDescriptionImpl,
)

export const withResponseLanguageInstruction = traceFunction(
  log,
  'withResponseLanguageInstruction',
  withResponseLanguageInstructionImpl,
)

export const normalizeBaseURL = traceFunction(
  log,
  'normalizeBaseURL',
  normalizeBaseURLImpl,
)

export const todoStatusIcon = traceFunction(
  log,
  'todoStatusIcon',
  todoStatusIconImpl,
)
