export const SUB_AGENT_TAG = ['sub-agents'] as const

export const INVOKE_AGENTS_TOOL_NAME = 'invoke_agents' as const

/** All sub-agent-related tool names. */
export const SUB_AGENT_TOOL_NAMES = new Set<string>([INVOKE_AGENTS_TOOL_NAME])

/**
 * Included in every skill catalog regardless of `allowed_tools`.
 * Single entry point: `invoke_agents` (one run for a single child; always waits).
 */
export const UNIVERSAL_SUB_AGENT_TOOL_NAMES = new Set<string>([
  INVOKE_AGENTS_TOOL_NAME,
])
