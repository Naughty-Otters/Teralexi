import { resolveAgentSkillId } from '@shared/agent/workspace-required-skills'

/** Settings tabs that require a Teralexi account (platform / advanced surfaces). */
export const SIGNED_IN_ONLY_SETTINGS_TABS = [] as const

export type SignedInOnlySettingsTab =
  (typeof SIGNED_IN_ONLY_SETTINGS_TABS)[number]

export function isSignedInOnlySettingsTab(
  tab: string,
): tab is SignedInOnlySettingsTab {
  return (SIGNED_IN_ONLY_SETTINGS_TABS as readonly string[]).includes(tab)
}

/**
 * Bundled skill ids that require a Teralexi account.
 * Website skill uses platform hosting (`app.web.publish`) and related tools.
 */
export const SIGNED_IN_ONLY_SKILL_IDS = ['website'] as const

export type SignedInOnlySkillId = (typeof SIGNED_IN_ONLY_SKILL_IDS)[number]

export function isSignedInOnlySkillId(skillId: string | null | undefined): boolean {
  const id = skillId?.trim()
  if (!id) return false
  return (SIGNED_IN_ONLY_SKILL_IDS as readonly string[]).includes(id)
}

/** Whether an agent is gated behind Teralexi sign-in for the current session. */
export function isAgentLockedWithoutSignIn(
  agent: { skillId?: string | null; id?: string },
  signedIn: boolean,
): boolean {
  if (signedIn) return false
  return isSignedInOnlySkillId(resolveAgentSkillId(agent))
}
