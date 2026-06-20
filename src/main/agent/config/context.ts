import type { SkillTool } from '@main/skills/types'
import { AGENT_DEFAULTS, AGENT_ERRORS, ENGINE_LOG } from './constants'
import {
  ANTHROPIC_MODELS,
  buildToolPromptDescription,
  DEFAULT_RESPONSE_LANGUAGE,
  DEFAULT_USER_ID,
  normalizeBaseURL,
  SYSTEM_PROP_KEYS,
  todoStatusIcon,
  withResponseLanguageInstruction,
} from './config'
import { loadEngineAgents } from './catalog'
import type { EngineAgent } from './catalog'

/**
 * Agent configuration surface for flow/step clients.
 * Obtain via {@link AgentFlowContext.config} / {@link AgentStepContext.config}.
 */
export class ConfigContext {
  static readonly DEFAULTS = AGENT_DEFAULTS
  static readonly ERRORS = AGENT_ERRORS
  static readonly ENGINE_LOG = ENGINE_LOG
  static readonly DEFAULT_USER_ID = DEFAULT_USER_ID
  static readonly DEFAULT_RESPONSE_LANGUAGE = DEFAULT_RESPONSE_LANGUAGE
  static readonly ANTHROPIC_MODELS = ANTHROPIC_MODELS
  static readonly SYSTEM_PROP_KEYS = SYSTEM_PROP_KEYS

  static loadEngineAgents = loadEngineAgents

  constructor(
    private readonly getResponseLanguage: () => string | undefined = () =>
      undefined,
  ) {}

  withResponseLanguageInstruction(
    prompt: string | undefined,
    responseLanguage?: string,
  ): string {
    const lang =
      responseLanguage?.trim() ||
      this.getResponseLanguage()?.trim() ||
      DEFAULT_RESPONSE_LANGUAGE
    return withResponseLanguageInstruction(prompt, lang)
  }

  buildToolPromptDescription(
    toolMeta: Omit<SkillTool, 'execute' | 'inputSchema'> & {
      inputSchema?: unknown
    },
  ): string {
    return buildToolPromptDescription(toolMeta)
  }

  todoStatusIcon(
    status: 'pending' | 'in-progress' | 'completed' | 'failed',
  ): string {
    return todoStatusIcon(status)
  }

  normalizeBaseURL(url: string, fallback: string): string {
    return normalizeBaseURL(url, fallback)
  }
}

export type { EngineAgent }
export { loadEngineAgents } from './catalog'
