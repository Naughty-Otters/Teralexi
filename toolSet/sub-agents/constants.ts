export const SUB_AGENT_TAG = ['sub-agents'] as const

export const INVOKE_AGENT_TOOL_NAME = 'invoke_agent' as const
export const INVOKE_AGENTS_TOOL_NAME = 'invoke_agents' as const
export const WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME = 'wait_for_sub_agent_runs' as const

export const SUB_AGENT_TOOL_NAMES = new Set<string>([
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_AGENTS_TOOL_NAME,
  WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME,
])

/** Included in every skill catalog regardless of `allowed_tools`. */
export const UNIVERSAL_SUB_AGENT_TOOL_NAMES = SUB_AGENT_TOOL_NAMES
