export {
  SUB_AGENT_TAG,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
  WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME,
  BEST_OF_N_TOOL_NAME,
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
export { invokeAgent } from './invoke-agent'
export { invokeAgents } from './invoke-agents'
export { waitForSubAgentRunsTool } from './wait-for-sub-agent-runs'
export { bestOfN } from './best-of-n'

import type { SkillTool } from '@main/skills/actions'
import { invokeAgent } from './invoke-agent'
import { invokeAgents } from './invoke-agents'
import { waitForSubAgentRunsTool } from './wait-for-sub-agent-runs'
import { bestOfN } from './best-of-n'

export const subAgentTools: SkillTool[] = [
  invokeAgent,
  invokeAgents,
  waitForSubAgentRunsTool,
  bestOfN,
]
