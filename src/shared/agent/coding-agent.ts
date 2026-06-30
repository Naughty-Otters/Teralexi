import { resolveAgentSkillId } from './workspace-required-skills'

/** Skill folder id for the primary coding assistant. */
export const CODING_AGENT_SKILL_ID = 'coding' as const

/** Bundled coding-family skills that receive coding-mode injection and tool policy. */
export const CODING_FAMILY_SKILL_IDS = [
  'coding',
  'coding-review',
  'coding-pr',
] as const

export type CodingFamilySkillId = (typeof CODING_FAMILY_SKILL_IDS)[number]

export function skillIsCodingFamily(
  skillId: string | null | undefined,
): skillId is CodingFamilySkillId | string {
  const id = skillId?.trim()
  if (!id) return false
  if ((CODING_FAMILY_SKILL_IDS as readonly string[]).includes(id)) return true
  return id.startsWith('coding-')
}

export function skillIsCodingAgent(
  skillId: string | null | undefined,
): boolean {
  return skillIsCodingFamily(skillId)
}

export function agentIsCodingAgent(agent: {
  skillId?: string | null
  id?: string
} | null | undefined): boolean {
  if (!agent) return false
  return skillIsCodingAgent(resolveAgentSkillId(agent))
}
