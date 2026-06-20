import { resolveAgentSkillId } from './workspace-required-skills'

/** Skill folder id for the primary coding assistant. */
export const CODING_AGENT_SKILL_ID = 'coding' as const

export function skillIsCodingAgent(
  skillId: string | null | undefined,
): boolean {
  return skillId?.trim() === CODING_AGENT_SKILL_ID
}

export function agentIsCodingAgent(agent: {
  skillId?: string | null
  id?: string
} | null | undefined): boolean {
  if (!agent) return false
  return skillIsCodingAgent(resolveAgentSkillId(agent))
}
