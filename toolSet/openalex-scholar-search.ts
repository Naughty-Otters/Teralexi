import type { WebSearchResult } from './web-search-engines'

const OPENALEX_API = 'https://api.openalex.org/works'
const OPENALEX_USER_AGENT =
  'OpenFDE/1.0 (mailto:support@openfde.local; academic search fallback)'

type OpenAlexWork = {
  id?: string
  display_name?: string
  publication_year?: number
  doi?: string | null
  primary_location?: {
    landing_page_url?: string | null
    source?: { display_name?: string | null }
  } | null
  authorships?: Array<{
    author?: { display_name?: string | null }
  }>
  abstract_inverted_index?: Record<string, number[]> | null
}

function collapseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeAbstract(inverted?: Record<string, number[]> | null): string {
  if (!inverted) return ''
  const pairs: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      pairs.push([pos, word])
    }
  }
  pairs.sort((a, b) => a[0] - b[0])
  return collapseText(pairs.map(([, word]) => word).join(' '))
}

function workUrl(work: OpenAlexWork): string {
  const landing = work.primary_location?.landing_page_url?.trim()
  if (landing?.startsWith('http')) return landing

  const doi = work.doi?.trim()
  if (doi) {
    const normalized = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    if (normalized) return `https://doi.org/${normalized}`
  }

  const id = work.id?.trim()
  if (id?.startsWith('http')) return id
  return id ? `https://openalex.org/${id.replace(/^https?:\/\/openalex\.org\//i, '')}` : ''
}

function workSnippet(work: OpenAlexWork): string {
  const abstract = decodeAbstract(work.abstract_inverted_index)
  if (abstract) return abstract.slice(0, 500)

  const authors = (work.authorships ?? [])
    .map((row) => row.author?.display_name?.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(', ')
  const journal = work.primary_location?.source?.display_name?.trim()
  const year =
    typeof work.publication_year === 'number'
      ? String(work.publication_year)
      : ''

  return collapseText(
    [authors, journal, year].filter(Boolean).join(' — '),
  )
}

export function mapOpenAlexWorkToSearchResult(work: OpenAlexWork): WebSearchResult | null {
  const title = collapseText(work.display_name ?? '')
  const url = workUrl(work)
  if (!title || !url.startsWith('http')) return null
  return {
    title,
    url,
    snippet: workSnippet(work),
  }
}

export async function searchOpenAlex(
  query: string,
  maxResults: number,
): Promise<{
  results: WebSearchResult[]
  searchUrl: string
  error?: string
}> {
  const trimmed = query.trim()
  if (!trimmed) {
    return { results: [], searchUrl: OPENALEX_API, error: 'Empty OpenAlex query' }
  }

  const url = new URL(OPENALEX_API)
  url.searchParams.set('search', trimmed)
  url.searchParams.set('per-page', String(Math.min(Math.max(maxResults, 1), 25)))
  url.searchParams.set('sort', 'relevance_score:desc')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': OPENALEX_USER_AGENT,
      },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      return {
        results: [],
        searchUrl: url.toString(),
        error: `OpenAlex request failed (${response.status})`,
      }
    }

    const payload = (await response.json()) as { results?: OpenAlexWork[] }
    const results: WebSearchResult[] = []
    const seen = new Set<string>()
    for (const work of payload.results ?? []) {
      const mapped = mapOpenAlexWorkToSearchResult(work)
      if (!mapped || seen.has(mapped.url)) continue
      seen.add(mapped.url)
      results.push(mapped)
      if (results.length >= maxResults) break
    }

    return {
      results,
      searchUrl: url.toString(),
      error:
        results.length === 0
          ? `No OpenAlex results for "${trimmed}".`
          : undefined,
    }
  } catch (err) {
    return {
      results: [],
      searchUrl: url.toString(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
