import { runExpressionLlmText } from '../../expr/run-expression-llm'
import type { AgentStepContext } from '../../context'
import type { ResolvedSearchConfig } from '../search-config'

export const SEARCH_QUERY_EXPANSION_LLM = {
  SYSTEM: `You rewrite a search topic into diverse search query angles.

Rules:
- Return ONLY JSON: an array of plain strings.
- Keep each query concise and directly searchable.
- Preserve user intent and factual neutrality.
- Prefer complementary angles (definitions, comparisons, recent updates, implementation details).
- Do not include markdown, numbering, or explanations.`,
  USER_PREFIX: 'Original search topic:',
  USER_COUNT: 'Number of queries to return:',
} as const

function normalizeQuery(value: string): string {
  return value
    .trim()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^['"]|['"]$/g, '')
}

function parseExpandedQueries(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? normalizeQuery(item) : ''))
        .filter(Boolean)
    }
  } catch {
    // Fall through to tolerant line parsing.
  }

  return text
    .split('\n')
    .map((line) => normalizeQuery(line))
    .filter(Boolean)
}

export async function expandSearchTopics(
  ctx: AgentStepContext,
  config: ResolvedSearchConfig,
): Promise<string[]> {
  const desiredCount = Math.max(1, config.queryExpansionCount)
  if (desiredCount === 1) return [config.topic]

  try {
    const response = await runExpressionLlmText(
      ctx,
      {
        instructions:
          config.queryExpansionPrompt?.trim() ||
          SEARCH_QUERY_EXPANSION_LLM.SYSTEM,
        userPrompt: [
          SEARCH_QUERY_EXPANSION_LLM.USER_PREFIX,
          config.topic,
          '',
          SEARCH_QUERY_EXPANSION_LLM.USER_COUNT,
          String(desiredCount),
        ].join('\n'),
      },
      ctx.currentMessages,
    )

    const candidates = parseExpandedQueries(response)
    const seen = new Set<string>()
    const unique: string[] = []

    for (const query of candidates) {
      const normalized = normalizeQuery(query)
      if (!normalized) continue
      const key = normalized.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(normalized)
      if (unique.length >= desiredCount) break
    }

    if (unique.length < desiredCount) {
      const original = normalizeQuery(config.topic)
      const key = original.toLowerCase()
      if (original && !seen.has(key)) {
        unique.push(original)
      }
    }

    return unique.length > 0 ? unique : [config.topic]
  } catch {
    return [config.topic]
  }
}
