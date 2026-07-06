import { shouldRedactPropertyKey } from '@shared/support-redact'
import type { SkillSystemPropertySpec } from './skill-system-properties'

export function formatSkillSystemPropertyConfiguredStatus(
  spec: SkillSystemPropertySpec,
  rawValue: string,
): string {
  const value = rawValue.trim()
  if (!value) return 'not configured'
  if (spec.type === 'secret' || shouldRedactPropertyKey(spec.key)) {
    return 'configured (value hidden)'
  }
  return `configured (${value})`
}

/** Markdown block listing declared skill system properties for agent instructions. */
export function buildSkillSystemPropertiesInstructionsBlock(
  specs: readonly SkillSystemPropertySpec[],
  valuesByKey: Record<string, string>,
): string {
  if (specs.length === 0) return ''

  const lines = specs.map((spec) => {
    const status = formatSkillSystemPropertyConfiguredStatus(
      spec,
      valuesByKey[spec.key] ?? '',
    )
    const desc = spec.description?.trim()
    const descSuffix = desc ? ` — ${desc}` : ''
    return `- **\`${spec.key}\`** (${spec.label}): ${status}${descSuffix}`
  })

  return [
    '### Skill configuration properties',
    '',
    'Persisted in ~/.teralexi/config/config.properties and managed in agent **Configurations** — do not ask users to paste secrets in chat.',
    '',
    ...lines,
  ].join('\n')
}
