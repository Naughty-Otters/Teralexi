/**
 * Lightweight, zero-latency thread tagger.
 *
 * Scores a piece of text against a fixed set of domain tags using regex keyword
 * patterns.  Returns a single primary tag — the tag with the most keyword hits —
 * plus the full scored breakdown for callers that want secondary tags.
 *
 * No LLM calls are made; this runs inline before agent.stream() starts.
 */

export const THREAD_TAGS = [
  'auth',
  'database',
  'testing',
  'ui',
  'api',
  'config',
  'build',
  'error',
  'performance',
  'security',
  'general',
] as const

export type ThreadTag = (typeof THREAD_TAGS)[number]

export interface TagScore {
  tag: ThreadTag
  score: number
}

// ---------------------------------------------------------------------------
// Keyword patterns per tag
// ---------------------------------------------------------------------------

const TAG_PATTERNS: Array<{ tag: ThreadTag; re: RegExp }> = [
  {
    tag: 'auth',
    re: /\b(auth(?:en(?:tication|ticate)|oriz(?:ation|e))?|login|logout|sign[- ]?(?:in|out|up)|password|token|session|jwt|oauth|sso|credential|permission|role|access[- ]?control|identity)\b/gi,
  },
  {
    tag: 'database',
    re: /\b(database|db|sql|sqlite|postgres(?:ql)?|mysql|mongo(?:db)?|query|migration|schema|table|index|join|repository|orm|transaction|cursor|select|insert|update|delete\s+from|knex|prisma|drizzle)\b/gi,
  },
  {
    tag: 'testing',
    re: /\b(test(?:s|ing|ed|er|suite)?|vitest|jest|mocha|chai|spec|mock(?:ing|ed)?|stub|fixture|assert(?:ion)?|expect|coverage|e2e|unit[- ]test|integration[- ]test|snapshot)\b/gi,
  },
  {
    tag: 'ui',
    re: /\b(ui|component|react|vue|angular|svelte|render(?:ing)?|style|css|tailwind|scss|front[- ]?end|page|view|layout|modal|dialog|form|button|input|widget|dom|html|jsx|tsx)\b/gi,
  },
  {
    tag: 'api',
    re: /\b(api|endpoint|rest(?:ful)?|graphql|grpc|http(?:s)?|request|response|fetch|axios|webhook|route|handler|controller|middleware|swagger|openapi)\b/gi,
  },
  {
    tag: 'config',
    re: /\b(config(?:uration|ure)?|setting|env(?:ironment)?|\.env|yaml|toml|ini|dotenv|constant|flag|feature[- ]?flag|env[- ]?var|process\.env)\b/gi,
  },
  {
    tag: 'build',
    re: /\b(build|compil(?:e|er|ation)|webpack|vite|esbuild|rollup|parcel|typescript|tsc|bundl(?:e|er|ing)|package\.json|npm|yarn|pnpm|ci(?:[/ -]cd)?|pipeline|artifact)\b/gi,
  },
  {
    tag: 'error',
    re: /\b(error|exception|crash|bug|fix(?:ing|ed)?|debug(?:ging)?|fail(?:ing|ure|ed)?|throw|catch|traceback|stack[- ]?trace|panic|abort|undefined\s+is\s+not)\b/gi,
  },
  {
    tag: 'performance',
    re: /\b(performance|optim(?:ize|ization)|slow(?:ness)?|speed(?:up)?|fast(?:er)?|cache|latency|profil(?:e|ing)|memory[- ]?leak?|cpu|benchmark|throughput|bottleneck)\b/gi,
  },
  {
    tag: 'security',
    re: /\b(securit(?:y|ies)|vulnerabilit(?:y|ies)|xss|sql[- ]injection|csrf|sanitiz(?:e|ation)|encrypt(?:ion)?|decrypt(?:ion)?|hash(?:ing)?|ssl|tls|certificate|secret|api[- ]key)\b/gi,
  },
]

// Path-segment patterns: if a file path appears in the text, infer the tag from it
const PATH_SEGMENT_TAG: Array<{ re: RegExp; tag: ThreadTag }> = [
  { re: /\/(auth(?:entication|orization)?|login|session|identity|oauth)\//i, tag: 'auth' },
  { re: /\/(db|database|migration|schema|repositories?|models?)\//i, tag: 'database' },
  { re: /\/(__tests__|tests?|spec(?:s)?|__mocks?__|fixtures?)\//i, tag: 'testing' },
  { re: /\.(test|spec)\.(ts|tsx|js|jsx)$/i, tag: 'testing' },
  { re: /\/(components?|ui|views?|pages?|layouts?|styles?)\//i, tag: 'ui' },
  { re: /\/(api|routes?|handlers?|controllers?|endpoints?)\//i, tag: 'api' },
  { re: /\/(config(?:uration)?|settings?|env)\//i, tag: 'config' },
  { re: /\/(build|dist|out|\.cache)\//i, tag: 'build' },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score `text` against all known tags.  Returns scores ordered highest first.
 * Zero-score tags are omitted unless all tags score zero.
 */
export function scoreThreadTags(text: string): TagScore[] {
  const counts = new Map<ThreadTag, number>()

  for (const { tag, re } of TAG_PATTERNS) {
    const matches = text.match(re)
    if (matches && matches.length > 0) {
      counts.set(tag, (counts.get(tag) ?? 0) + matches.length)
    }
  }

  // Bonus points for path-segment signals (strong structural cue)
  for (const { re, tag } of PATH_SEGMENT_TAG) {
    if (re.test(text)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 3)
    }
  }

  const scored = [...counts.entries()]
    .map(([tag, score]) => ({ tag, score }))
    .sort((a, b) => b.score - a.score)

  return scored.length > 0 ? scored : [{ tag: 'general', score: 0 }]
}

/**
 * Extract the single primary thread tag from a message or content string.
 * Falls back to 'general' when no patterns match.
 */
export function extractThreadTag(text: string): ThreadTag {
  const scores = scoreThreadTags(text)
  return scores[0].tag
}

/**
 * Extract top-N thread tags.  Useful for multi-faceted queries.
 */
export function extractTopThreadTags(text: string, n = 2): ThreadTag[] {
  return scoreThreadTags(text)
    .slice(0, n)
    .map((s) => s.tag)
}
