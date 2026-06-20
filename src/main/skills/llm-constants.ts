/** LLM-related strings for skill markdown and system prompt assembly. */

import { SKILL_DEFAULT_PROPERTIES } from './constants'

export const SKILL_MARKDOWN_LLM = {
  EXAMPLES_SECTION: '## Examples',
  EXAMPLE_USER_PREFIX: 'User:',
  EXAMPLE_ASSISTANT_PREFIX: 'Assistant:',
} as const

export const SKILL_MARKDOWN_SECTIONS = {
  INSTRUCTIONS: 'Instructions',
  SUMMARY: 'Summary',
  ANALYSIS: 'Analysis',
  REPORT: 'Report',
  TOOLS: 'Tools',
  EXAMPLES: 'Examples',
  CONSTRAINTS: 'Constraints',
  GUARD_RAILS: 'GuardRails',
} as const

export function buildDefaultPropertiesYaml(
  displayName: string,
  skillId: string,
): string {
  const name = displayName || skillId
  return [
    `name: ${name}`,
    'description:',
    `model: ${SKILL_DEFAULT_PROPERTIES.MODEL}`,
    `provider: ${SKILL_DEFAULT_PROPERTIES.PROVIDER}`,
    `color: ${SKILL_DEFAULT_PROPERTIES.COLOR}`,
    `enabled: ${SKILL_DEFAULT_PROPERTIES.ENABLED}`,
  ].join('\n')
}
