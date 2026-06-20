export const WORKFLOW_COMPILER_SKILL_ID = 'workflow-compiler'
export const WORKFLOW_RUNTIME_SKILL_ID = 'workflow-runtime'

/** Default executor agent for compiled workflow definitions. */
export const WORKFLOW_RUNTIME_AGENT_ID = `skill:${WORKFLOW_RUNTIME_SKILL_ID}` as const

export const WORKFLOW_PANEL_SKILL_IDS = [
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_RUNTIME_SKILL_ID,
] as const

export type WorkflowPanelSkillId = (typeof WORKFLOW_PANEL_SKILL_IDS)[number]

export function isWorkflowPanelSkillId(skillId: string): boolean {
  return (WORKFLOW_PANEL_SKILL_IDS as readonly string[]).includes(skillId)
}

export function isWorkflowPanelAgentId(agentId: string): boolean {
  const trimmed = agentId.trim()
  if (!trimmed) return false
  const skillId = trimmed.startsWith('skill:')
    ? trimmed.slice('skill:'.length)
    : trimmed
  return isWorkflowPanelSkillId(skillId)
}
