import type { ScholarSearchCategory, ScholarSearchScope } from '@toolSet/scholar-courts'

export type SearchBackend = 'web' | 'scholar'

export type SearchBackendChoice = {
  backend: SearchBackend
  scope: ScholarSearchScope
  /** Short label for progress logs. */
  reason: string
}

const SCHOLAR_SIGNAL =
  /\b(scholar|peer[- ]?review|journal|doi\b|pubmed|arxiv|systematic review|meta[- ]?analysis|literature review|academic paper|research paper|citation|bibliograph|white paper|patent|case law|precedent|plaintiff|defendant|statute|supreme court|circuit court|federal court|state court|legal opinion|court ruling|amicus|treatise|dissertation|thesis)\b/i

const CASE_LAW_SIGNAL =
  /\b(case law|court ruling|legal opinion|precedent|plaintiff|defendant|v\.|vs\.|supreme court|circuit court|federal court|state court|statute|amicus|litigation|appellate)\b/i

const PATENT_SIGNAL = /\b(patent|patents|uspto|invention disclosure)\b/i

/** US state names/codes often appear in legal queries. */
const STATE_CODE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/

const WEB_SIGNAL =
  /\b(latest news|breaking|today|yesterday|this week|stock price|restaurant|menu|buy|price|coupon|tutorial|how to|github|npm package|product review|release notes|changelog|job posting|hiring|twitter|reddit thread)\b/i

function defaultArticleScope(): ScholarSearchScope {
  return { category: 'article' }
}

function inferScholarScope(query: string): ScholarSearchScope {
  if (CASE_LAW_SIGNAL.test(query)) {
    if (STATE_CODE.test(query)) {
      const match = query.match(STATE_CODE)
      return {
        category: 'case_law_state',
        state: match?.[0],
      }
    }
    if (/\bfederal\b/i.test(query)) {
      return { category: 'case_law_federal' }
    }
    return { category: 'case_law' }
  }

  if (PATENT_SIGNAL.test(query)) {
    return { category: 'article', includePatents: true }
  }

  return defaultArticleScope()
}

/**
 * Pick web SERP search vs Google Scholar deep research for a query.
 * `mode: 'auto'` uses content signals; explicit modes force a backend.
 */
export function chooseSearchBackend(
  query: string,
  mode: 'auto' | 'web' | 'scholar' = 'auto',
): SearchBackendChoice {
  const trimmed = query.trim()
  if (!trimmed) {
    return {
      backend: 'web',
      scope: defaultArticleScope(),
      reason: 'empty query defaults to web search',
    }
  }

  if (mode === 'web') {
    return {
      backend: 'web',
      scope: defaultArticleScope(),
      reason: 'configured for web search',
    }
  }

  if (mode === 'scholar') {
    return {
      backend: 'scholar',
      scope: inferScholarScope(trimmed),
      reason: 'configured for deep research (Google Scholar)',
    }
  }

  const scholarScore =
    (SCHOLAR_SIGNAL.test(trimmed) ? 2 : 0) +
    (CASE_LAW_SIGNAL.test(trimmed) ? 2 : 0) +
    (PATENT_SIGNAL.test(trimmed) ? 1 : 0)
  const webScore = WEB_SIGNAL.test(trimmed) ? 2 : 0

  if (scholarScore > webScore) {
    return {
      backend: 'scholar',
      scope: inferScholarScope(trimmed),
      reason: 'academic or legal signals in query',
    }
  }

  if (webScore > scholarScore) {
    return {
      backend: 'web',
      scope: defaultArticleScope(),
      reason: 'current-events or general-web signals in query',
    }
  }

  // Tie-break: broad topics default to web; citation-style queries to scholar.
  if (/\b\d{4}[a-z]?\b|et al\.|vol\.|pp\.\s*\d/i.test(trimmed)) {
    return {
      backend: 'scholar',
      scope: inferScholarScope(trimmed),
      reason: 'citation-style query',
    }
  }

  return {
    backend: 'web',
    scope: defaultArticleScope(),
    reason: 'general topic defaults to web search',
  }
}

export type SearchBackendMode = 'auto' | 'web' | 'scholar'
