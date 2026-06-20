/**
 * Agent configuration — defaults, provider keys, and agent catalog.
 *
 * Import from this barrel only. Agent steps should use {@link ConfigContext} via
 * {@link AgentFlowContext.config}, not this module directly.
 */

export { AGENT_DEFAULTS, AGENT_ERRORS, ENGINE_LOG } from './constants'

export {
  DEFAULT_USER_ID,
  DEFAULT_RESPONSE_LANGUAGE,
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  ZHIPU_MODELS,
  SYSTEM_PROP_KEYS,
  buildToolPromptDescription,
  withResponseLanguageInstruction,
  normalizeBaseURL,
  todoStatusIcon,
} from './config'

export { loadEngineAgents } from './catalog'
export type { EngineAgent } from './catalog'
export { ConfigContext } from './context'
