export const EXPLORE_MANIFEST_VERSION = 1 as const

export type ExploreManifestFileEntry = {
  path: string
  snippet?: string
  offset?: number
  limit?: number
  mtimeMs?: number
  isDirectory?: boolean
  entryCount?: number
}

export type ExploreManifestSearchEntry = {
  tool: 'grep_files' | 'glob_files'
  pattern: string
  root: string
  hitCount?: number
}

export type ExploreManifestResourceKind =
  | 'web_search'
  | 'web_scrape'
  | 'deep_research'

export type ExploreManifestResourceEntry = {
  kind: ExploreManifestResourceKind
  url?: string
  query?: string
  title?: string
  snippet?: string
  resultCount?: number
  scopeLabel?: string
  topUrls?: string[]
}

export type ExploreFileManifest = {
  version: typeof EXPLORE_MANIFEST_VERSION
  updatedAt: string
  conversationId: string
  planSlug: string
  files: ExploreManifestFileEntry[]
  searches?: ExploreManifestSearchEntry[]
  resources?: ExploreManifestResourceEntry[]
}

export function parseExploreFileManifest(raw: unknown): ExploreFileManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== EXPLORE_MANIFEST_VERSION) return null
  if (typeof o.conversationId !== 'string' || !o.conversationId.trim()) return null
  if (typeof o.planSlug !== 'string' || !o.planSlug.trim()) return null
  if (typeof o.updatedAt !== 'string') return null
  if (!Array.isArray(o.files)) return null

  const files: ExploreManifestFileEntry[] = []
  for (const item of o.files) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    if (typeof f.path !== 'string' || !f.path.trim()) continue
    files.push({
      path: f.path.trim(),
      ...(typeof f.snippet === 'string' ? { snippet: f.snippet } : {}),
      ...(typeof f.offset === 'number' ? { offset: f.offset } : {}),
      ...(typeof f.limit === 'number' ? { limit: f.limit } : {}),
      ...(typeof f.mtimeMs === 'number' ? { mtimeMs: f.mtimeMs } : {}),
      ...(f.isDirectory === true ? { isDirectory: true } : {}),
      ...(typeof f.entryCount === 'number' ? { entryCount: f.entryCount } : {}),
    })
  }

  const searches: ExploreManifestSearchEntry[] = []
  if (Array.isArray(o.searches)) {
    for (const item of o.searches) {
      if (!item || typeof item !== 'object') continue
      const s = item as Record<string, unknown>
      if (s.tool !== 'grep_files' && s.tool !== 'glob_files') continue
      if (typeof s.pattern !== 'string' || typeof s.root !== 'string') continue
      searches.push({
        tool: s.tool,
        pattern: s.pattern,
        root: s.root,
        ...(typeof s.hitCount === 'number' ? { hitCount: s.hitCount } : {}),
      })
    }
  }

  const resources: ExploreManifestResourceEntry[] = []
  if (Array.isArray(o.resources)) {
    for (const item of o.resources) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      if (
        r.kind !== 'web_search' &&
        r.kind !== 'web_scrape' &&
        r.kind !== 'deep_research'
      ) {
        continue
      }
      const entry: ExploreManifestResourceEntry = { kind: r.kind }
      if (typeof r.url === 'string' && r.url.trim()) entry.url = r.url.trim()
      if (typeof r.query === 'string' && r.query.trim()) {
        entry.query = r.query.trim()
      }
      if (typeof r.title === 'string' && r.title.trim()) {
        entry.title = r.title.trim()
      }
      if (typeof r.snippet === 'string') entry.snippet = r.snippet
      if (typeof r.resultCount === 'number') entry.resultCount = r.resultCount
      if (typeof r.scopeLabel === 'string' && r.scopeLabel.trim()) {
        entry.scopeLabel = r.scopeLabel.trim()
      }
      if (Array.isArray(r.topUrls)) {
        entry.topUrls = r.topUrls.filter(
          (u): u is string => typeof u === 'string' && u.trim().length > 0,
        )
      }
      if (entry.url || entry.query) resources.push(entry)
    }
  }

  return {
    version: EXPLORE_MANIFEST_VERSION,
    updatedAt: o.updatedAt,
    conversationId: o.conversationId.trim(),
    planSlug: o.planSlug.trim(),
    files,
    ...(searches.length > 0 ? { searches } : {}),
    ...(resources.length > 0 ? { resources } : {}),
  }
}

export function exploreManifestHasContent(manifest: ExploreFileManifest): boolean {
  return (
    manifest.files.length > 0 ||
    (manifest.resources?.length ?? 0) > 0 ||
    (manifest.searches?.length ?? 0) > 0
  )
}
