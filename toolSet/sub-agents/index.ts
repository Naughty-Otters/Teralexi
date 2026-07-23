export {
  SUB_AGENT_TAG,
  INVOKE_AGENTS_TOOL_NAME,
  SUB_AGENT_TOOL_NAMES,
  UNIVERSAL_SUB_AGENT_TOOL_NAMES,
} from './constants'
export {
  bindSubAgentDelegation,
  clearSubAgentDelegation,
  getSubAgentDelegation,
  requireSubAgentDelegation,
  resetSubAgentDelegationStack,
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
  type SubAgentDelegationContext,
  type SubAgentChildParams,
  type SubAgentParentRun,
} from './delegation-context'
export { invokeAgents } from './invoke-agents'
export {
  SUBAGENT_PROFILES,
  resolveSubagentProfile,
  applySubagentProfileToTask,
  formatBuiltinSubagentPriorityInstructions,
  filterMcpToolsForSubagentAccess,
  isBrowserMcpToolName,
  type SubagentProfile,
  type SubagentMcpAccess,
} from './subagent-profiles'

import type { SkillTool } from '@main/skills/actions'
import { invokeAgents } from './invoke-agents'

export const subAgentTools: SkillTool[] = [invokeAgents]
