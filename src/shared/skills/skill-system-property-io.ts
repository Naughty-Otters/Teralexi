import {
  GOOGLE_WORKSPACE_PROP_KEYS,
  googleWorkspaceOAuthConfiguredFromMap,
} from '@shared/google-workspace-settings'
import type { SkillSystemPropertySpec } from './skill-system-properties'
import {
  listMissingSkillSystemProperties,
  skillSystemPropertyKeys,
  skillSystemPropertyValuesFromMap,
} from './skill-system-properties'

export function expandSkillSystemPropertyFetchKeys(
  specs: readonly SkillSystemPropertySpec[],
): string[] {
  return skillSystemPropertyKeys(specs)
}

export function normalizeSkillSystemPropertyValues(
  specs: readonly SkillSystemPropertySpec[],
  loaded: Record<string, string>,
): Record<string, string> {
  return skillSystemPropertyValuesFromMap(
    skillSystemPropertyKeys(specs),
    loaded,
  )
}

export function skillSystemPropertiesConfigured(
  specs: readonly SkillSystemPropertySpec[],
  values: Record<string, string>,
): boolean {
  if (specs.length === 0) return true
  return (
    listMissingSkillSystemProperties(skillSystemPropertyKeys(specs), values)
      .length === 0
  )
}

export function googleWorkspaceOAuthConfiguredFromSpecs(
  specs: readonly SkillSystemPropertySpec[],
  values: Record<string, string>,
): boolean {
  const clientId = values[GOOGLE_WORKSPACE_PROP_KEYS.clientId]?.trim()
  if (clientId) return true
  const declaresClientId = specs.some(
    (spec) => spec.key === GOOGLE_WORKSPACE_PROP_KEYS.clientId,
  )
  if (!declaresClientId) {
    return googleWorkspaceOAuthConfiguredFromMap(values)
  }
  return false
}
