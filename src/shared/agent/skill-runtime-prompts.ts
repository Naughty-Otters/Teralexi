/** Runtime prompt views for compiled skill artifacts (settings UI). */

export type RuntimeCompiledPromptSource = {
  thinking?: { instructions?: string }
  instructions?: { instructions?: string }
  validation?: { rules?: string[] }
}

export type RuntimePromptViews = {
  thinking: string
  instructions: string
  validation: string
}

function formatValidationRules(rules: string[]): string {
  if (rules.length === 0) return ''
  return ['### Validation rules', '', ...rules.map((r) => `- ${r}`)].join('\n')
}

export function buildRuntimePromptViews(
  compiled: RuntimeCompiledPromptSource | null | undefined,
): RuntimePromptViews | null {
  if (!compiled) return null
  return {
    thinking: compiled.thinking?.instructions?.trim() ?? '',
    instructions: compiled.instructions?.instructions?.trim() ?? '',
    validation: formatValidationRules(compiled.validation?.rules ?? []),
  }
}
