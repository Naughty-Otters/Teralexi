import { resolveAgentSkillId } from './workspace-required-skills'

/** Skill folder id for GitHub CLI tools. */
export const GITHUB_SKILL_ID = 'github' as const

export function skillIsGitHubAgent(skillId: string | null | undefined): boolean {
  return skillId?.trim() === GITHUB_SKILL_ID
}

export function agentIsGitHubAgent(
  agent: {
    skillId?: string | null
    id?: string
  } | null | undefined,
): boolean {
  if (!agent) return false
  return skillIsGitHubAgent(resolveAgentSkillId(agent))
}

export function githubComposerHint(_options: {
  agentIsGitHub: boolean
  isSignedIn: boolean
  hasSkillAccess: boolean
}): string | null {
  return null
}
