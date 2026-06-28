/** Settings tabs that require an OpenFDE account (Google sign-in). */
export const SIGNED_IN_ONLY_SETTINGS_TABS = [
  'skills',
  'agents',
  'channels',
  'scheduler',
  'memory',
  'chat',
  'mcp',
  'developer',
  'about',
] as const

export type SignedInOnlySettingsTab =
  (typeof SIGNED_IN_ONLY_SETTINGS_TABS)[number]

export function isSignedInOnlySettingsTab(
  tab: string,
): tab is SignedInOnlySettingsTab {
  return (SIGNED_IN_ONLY_SETTINGS_TABS as readonly string[]).includes(tab)
}
