import type { AgentStepContext } from '../../context'
import { runExpressionLlmText } from '../../expr/run-expression-llm'
import type { ResolvedSearchConfig, SearchResultItem } from '../search-config'
import { formatSearchItemsForPrompt } from './format-search'

export const SEARCH_LLM = {
  ABSTRACTION_SYSTEM: `You synthesize web search snippets into one coherent overview.

Rules:
- Stay faithful to the provided search hits; do not invent sources or facts.
- Do not scrape or assume full page content — only use the brief snippets given.
- Highlight the main themes, disagreements, and actionable takeaways for the topic.
- Write in clear prose (2–4 short paragraphs unless the topic is very narrow).`,
  ABSTRACTION_USER_PREFIX: 'Research topic:',
  ABSTRACTION_ITEMS_LABEL: 'Search hits (address + brief only):',
  NO_RESULTS_ABSTRACTION:
    'No web search results were returned for this topic. State that clearly and suggest how the user could refine the query.',
  ABSTRACTION_FAILED:
    'Search abstraction could not be generated. Continue using any available scrape outputs only.',
} as const

export async function generateSearchAbstraction(
  ctx: AgentStepContext,
  config: ResolvedSearchConfig,
  items: SearchResultItem[],
): Promise<string> {
  if (items.length === 0) {
    return SEARCH_LLM.NO_RESULTS_ABSTRACTION
  }

  const system =
    config.abstractionPrompt?.trim() || SEARCH_LLM.ABSTRACTION_SYSTEM

  try {
    return await runExpressionLlmText(
      ctx,
      {
        instructions: system,
        userPrompt: [
          SEARCH_LLM.ABSTRACTION_USER_PREFIX,
          config.topic,
          '',
          SEARCH_LLM.ABSTRACTION_ITEMS_LABEL,
          formatSearchItemsForPrompt(items),
        ].join('\n'),
      },
      ctx.currentMessages,
    )
  } catch {
    return SEARCH_LLM.ABSTRACTION_FAILED
  }
}
