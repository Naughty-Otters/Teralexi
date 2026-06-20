import type {
  SkillConstraint,
  SkillExample,
  SkillGuardRail,
  SkillProperties,
  SkillSections,
  SkillTool,
} from './types'
import type { SkillDefinition } from './skill-models'
import { parseSkillVisibility } from './skill-visibility'
import { SKILL_MARKDOWN_LLM, SKILL_MARKDOWN_SECTIONS } from './llm-constants'

/** Parse simple `key: value` frontmatter (no nested YAML needed) */
export function parseFrontmatter(raw: string): Partial<SkillProperties> {
  const result: Record<string, unknown> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/)
    if (!m) continue
    const [, key, val] = m
    if (val === 'true') result[key] = true
    else if (val === 'false') result[key] = false
    else result[key] = val.trim()
  }
  return result as Partial<SkillProperties>
}

/** Extract the body of a `## Heading` section */
export function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`, 'im')
  const match = pattern.exec(content)
  if (!match) return ''

  const afterHeading = content.slice(match.index + match[0].length)
  const nextHeading = afterHeading.search(/^##\s/m)
  const body =
    nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)
  return body.trim()
}

export function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') || l.startsWith('* '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean)
}

export function extractConstraints(text: string): SkillConstraint[] {
  return extractBullets(text).map((raw) => ({
    expression: raw,
    message: raw,
    severity: 'error' as const,
  }))
}

export function extractGuardRails(text: string): SkillGuardRail[] {
  return extractBullets(text).map((raw) => ({
    rule: raw,
    action: 'refuse' as const,
    message: raw,
  }))
}

export function extractExamples(text: string): SkillExample[] {
  const examples: SkillExample[] = []
  const parts = text.split(/^###\s+User\s*$/im)
  for (const part of parts.slice(1)) {
    const halves = part.split(/^###\s+Assistant\s*$/im)
    if (halves.length < 2) continue
    examples.push({
      user: halves[0].trim(),
      assistant: halves[1].trim(),
    })
  }
  return examples
}

export function normalizeToolName(value: string): string {
  return value.split(':', 1)[0].trim().replace(/^`|`$/g, '')
}

export function parseCommaSeparatedToolList(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((entry) => normalizeToolName(entry.trim()))
    .filter(Boolean)
}

export function extractTools(text: string): string[] {
  const bullets = extractBullets(text)
  if (bullets.length > 0) {
    return bullets.map(normalizeToolName).filter(Boolean)
  }
  return parseCommaSeparatedToolList(text)
}

/** Instructions section, or full markdown body when no ## Instructions heading exists. */
export function extractInstructions(skillRaw: string): string {
  const fromSection = extractSection(
    skillRaw,
    SKILL_MARKDOWN_SECTIONS.INSTRUCTIONS,
  ).trim()
  if (fromSection) return fromSection
  return skillRaw.trim()
}

export function buildSystemPrompt(sections: SkillSections): string {
  const parts: string[] = []

  if (sections.instructions) {
    parts.push(sections.instructions)
  }

  if (sections.examples.length > 0) {
    const block = sections.examples
      .map(
        (e) =>
          `${SKILL_MARKDOWN_LLM.EXAMPLE_USER_PREFIX} ${e.user}\n${SKILL_MARKDOWN_LLM.EXAMPLE_ASSISTANT_PREFIX} ${e.assistant}`,
      )
      .join('\n\n')
    parts.push(`\n${SKILL_MARKDOWN_LLM.EXAMPLES_SECTION}\n${block}`)
  }

  return parts.join('\n').trim()
}

/**
 * Parse skill files into a SkillDefinition.
 * Returns `null` if required fields are missing or cannot be parsed.
 */
export function parseSkillMarkdown(
  id: string,
  folder: string,
  propertiesRaw: string,
  skillRaw: string,
  summaryRaw?: string,
  reportRaw?: string,
  resolvedTools: SkillTool[] = [],
): SkillDefinition | null {
  const fm = parseFrontmatter(propertiesRaw)

  if (!fm.name || !fm.model || !fm.provider) return null

  const allowedTools = parseCommaSeparatedToolList(
    fm.allowed_tools as string | undefined,
  )

  const rawMaxIterations = Number(
    (fm as Record<string, unknown>).max_iterations,
  )
  const maxIterations = Number.isFinite(rawMaxIterations)
    ? rawMaxIterations
    : undefined

  const properties: SkillProperties = {
    name: fm.name,
    description: fm.description ?? '',
    model: fm.model,
    provider: fm.provider,
    color: fm.color ?? 'primary',
    enabled: fm.enabled !== false,
    visibility: parseSkillVisibility(fm.visibility as string | undefined),
    ...(allowedTools.length > 0 ? { allowedTools } : {}),
    ...(maxIterations != null ? { maxIterations } : {}),
  }

  const summaryText =
    summaryRaw ??
    extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.SUMMARY) ??
    extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.ANALYSIS)
  const reportText =
    reportRaw ?? extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.REPORT)

  const explicitTools = extractTools(
    extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.TOOLS),
  )

  const declaredToolNames =
    explicitTools.length > 0
      ? explicitTools
      : resolvedTools.map((tool) => tool.name)

  const sections: SkillSections = {
    fullMarkdown: skillRaw.trim(),
    instructions: extractInstructions(skillRaw),
    summary: summaryText.trim(),
    report: reportText.trim(),
    examples: extractExamples(
      extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.EXAMPLES),
    ),
    tools: declaredToolNames,
  }

  return {
    id,
    folder,
    properties,
    sections,
    systemPrompt: buildSystemPrompt(sections),
    /** Full toolSet catalog (+ skill actions) for agent AvailableSet and runtime. */
    tools: resolvedTools,
    actionToolNames: [],
  }
}
