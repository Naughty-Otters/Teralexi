/** Top-level barrel for the skill-module loader (see `toolSet/sub-agents/`). */
export {
  SUB_AGENT_TAG,
  INVOKE_AGENTS_TOOL_NAME,
  SUB_AGENT_TOOL_NAMES,
  UNIVERSAL_SUB_AGENT_TOOL_NAMES,
  bindSubAgentDelegation,
  clearSubAgentDelegation,
  getSubAgentDelegation,
  requireSubAgentDelegation,
  resetSubAgentDelegationStack,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  invokeAgents,
  subAgentTools,
} from './sub-agents/index'
