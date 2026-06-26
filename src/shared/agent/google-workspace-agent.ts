import { resolveAgentSkillId } from './workspace-required-skills'

/** Skill folder id for Gmail, Calendar, and Drive tools. */
export const GOOGLE_WORKSPACE_SKILL_ID = 'google-workspace' as const

export function skillIsGoogleWorkspaceAgent(
  skillId: string | null | undefined,
): boolean {
  return skillId?.trim() === GOOGLE_WORKSPACE_SKILL_ID
}

export function agentIsGoogleWorkspaceAgent(
  agent: {
    skillId?: string | null
    id?: string
  } | null | undefined,
): boolean {
  if (!agent) return false
  return skillIsGoogleWorkspaceAgent(resolveAgentSkillId(agent))
}

export function googleWorkspaceComposerHint(options: {
  agentIsGoogleWorkspace: boolean
  isSignedIn: boolean
  hasWorkspaceAccess: boolean
}): string | null {
  if (!options.agentIsGoogleWorkspace) return null
  if (!options.isSignedIn) {
    return 'Sign in with Google Workspace in Settings → General → Google Workspace to use Gmail, Calendar, and Drive.'
  }
  if (!options.hasWorkspaceAccess) {
    return 'Google Workspace permissions are missing. Sign out and sign in again in Settings → General → Google Workspace.'
  }
  return null
}
