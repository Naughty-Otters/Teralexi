/** Skill folder ids that require a user workspace folder before sending messages. */
export const WORKSPACE_REQUIRED_SKILL_IDS = ['coding', 'code-review'] as const

export type WorkspaceRequiredSkillId = (typeof WORKSPACE_REQUIRED_SKILL_IDS)[number]

export function resolveAgentSkillId(agent: {
  skillId?: string | null
  id?: string
}): string | null {
  const fromField = agent.skillId?.trim()
  if (fromField) return fromField
  const id = agent.id?.trim()
  if (id?.startsWith('skill:')) return id.slice('skill:'.length)
  return null
}

export function skillRequiresWorkspace(skillId: string | null | undefined): boolean {
  const id = skillId?.trim()
  if (!id) return false
  return (WORKSPACE_REQUIRED_SKILL_IDS as readonly string[]).includes(id)
}

export function agentRequiresWorkspace(agent: {
  skillId?: string | null
  id?: string
}): boolean {
  return skillRequiresWorkspace(resolveAgentSkillId(agent))
}
