import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { searchGoogleScholar } from './google-scholar-search'
import {
  listScholarSearchOptions,
  SCHOLAR_FEDERAL_COURTS,
  SCHOLAR_SEARCH_CATEGORIES,
  SCHOLAR_US_STATE_COURTS,
  type ScholarFederalCourtKey,
  type ScholarSearchCategory,
  type ScholarSearchScope,
} from './scholar-courts'

const DEFAULT_MAX_RESULTS = 8

const federalCourtKeys = SCHOLAR_FEDERAL_COURTS.map((c) => c.key) as [
  ScholarFederalCourtKey,
  ...ScholarFederalCourtKey[],
]

const deepResearchInput = z
  .object({
  query: z
    .string()
    .optional()
    .describe(
      'Research query (paper title, legal issue, citation keywords, etc.).',
    ),
  category: z
    .enum(SCHOLAR_SEARCH_CATEGORIES)
    .default('article')
    .describe(
      'Search category: `article` (papers), `case_law` (all US courts), `case_law_federal`, or `case_law_state`.',
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(DEFAULT_MAX_RESULTS)
    .describe('Maximum results to return (1–20).'),
  federalCourt: z
    .enum(federalCourtKeys)
    .optional()
    .describe(
      'Optional federal court filter (e.g. supreme_court, ninth_circuit). Use with case-law categories.',
    ),
  state: z
    .string()
    .optional()
    .describe(
      'US state code (e.g. CA, NY) or full state name — narrows case-law search to that state.',
    ),
  includePatents: z
    .boolean()
    .optional()
    .describe('When category is `article`, include patents (`as_sdt=7`).'),
  customAsSdt: z
    .string()
    .optional()
    .describe(
      'Advanced: raw Google Scholar `as_sdt` value (e.g. `4,33` for New York courts). Overrides category defaults.',
    ),
  listOptions: z
    .boolean()
    .optional()
    .describe(
      'If true, returns available categories, federal courts, and state court filters without running a search.',
    ),
})
  .superRefine((data, ctx) => {
    if (data.listOptions) return
    if (!data.query?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'query is required unless listOptions is true',
        path: ['query'],
      })
    }
  })

function buildScholarScope(parsed: z.infer<typeof deepResearchInput>): ScholarSearchScope {
  return {
    category: parsed.category as ScholarSearchCategory,
    federalCourt: parsed.federalCourt,
    state: parsed.state,
    includePatents: parsed.includePatents,
    customAsSdt: parsed.customAsSdt,
  }
}

export const deepResearch: SkillTool = {
  name: 'deep_research',
  tags: ['web', 'research', 'scholar'],
  description:
    'Deep research via Google Scholar (not general web search). Categories: scholarly articles (`article`), US case law (`case_law`, `case_law_federal`, `case_law_state`). Optional `federalCourt` (Supreme Court, circuits, Tax Court, …) or `state` (US state code/name). Set `listOptions: true` to list all court filters. Uses Playwright with stealth browser first; falls back to OpenAlex API when Scholar blocks access. No API keys.',
  inputSchema: deepResearchInput,
  needsApproval: false,
  async execute(input) {
    const parsed = deepResearchInput.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() }
    }

    if (parsed.data.listOptions) {
      const options = listScholarSearchOptions()
      return {
        success: true,
        listOnly: true,
        categories: options.categories,
        federalCourts: options.federalCourts.map((c) => ({
          key: c.key,
          label: c.label,
          asSdt: c.asSdt,
        })),
        states: options.states.map((s) => ({
          state: s.state,
          code: s.code,
          asSdt: s.asSdt,
        })),
      }
    }

    const { query, maxResults } = parsed.data
    const scope = buildScholarScope(parsed.data)

    try {
      const outcome = await searchGoogleScholar(query, maxResults, scope)
      if (outcome.results.length === 0) {
        return {
          success: false,
          error:
            outcome.error ??
            `No Google Scholar results for "${query}" (${outcome.scopeLabel}).`,
          query,
          category: scope.category,
          scopeLabel: outcome.scopeLabel,
          searchUrl: outcome.searchUrl,
          availableFilters: listScholarSearchOptions(),
        }
      }

      return {
        success: true,
        query,
        category: scope.category,
        scopeLabel: outcome.scopeLabel,
        searchUrl: outcome.searchUrl,
        resultCount: outcome.results.length,
        source: outcome.source ?? 'google_scholar',
        results: outcome.results,
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        query,
        category: scope.category,
      }
    }
  },
}
