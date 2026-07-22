import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  EXPLORE_MANIFEST_VERSION,
  exploreManifestHasContent,
  parseExploreFileManifest,
  type ExploreFileManifest,
  type ExploreManifestFileEntry,
  type ExploreManifestResourceEntry,
  type ExploreManifestSearchEntry,
} from '@shared/agent/explore-manifest'
import { getConversationStore } from '@main/services/conversation-store'
import type { StoredToolResult } from '@main/services/conversation-store/types'
import { READ_FILE_PRUNE_PREVIEW_CHARS } from '../expr/context-overflow-guard'
import {
  normalizeToolInputForDedupeKey,
  normalizeToolPathForKey,
  type ToolPathNormalizeContext,
} from '../expr/tool-input-normalize'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import { ENTER_PLAN_MODE_TOOL_NAME } from '@toolSet/planning'
import {
  ensurePlanModePlansDir,
  type PlanModeStorageOptions,
  resolvePlanModeStorage,
} from './plan-mode-storage-impl'
import { getWorkspacePath } from '../workspace/conversation-workspace'

export const MAX_MANIFEST_FILE_ENTRIES = 40
export const MAX_MANIFEST_SEARCH_ENTRIES = 20
export const MAX_MANIFEST_RESOURCE_ENTRIES = 20
export const MAX_MANIFEST_INSTRUCTION_CHARS = 8_000

const MANIFEST_TOOLS = new Set([
  'read_file',
  'lsp',
  'shell',
  'web_search',
  'web_scrape',
  // Legacy explore tools (kept for reading older manifests / transcripts)
  'grep_files',
  'glob_files',
  'deep_research',
])

export { exploreManifestHasContent }

export function parsePathFromInputSummary(summary: string): string | undefined {
  const m = summary.match(/(?:^|,\s*)path=([^,]+)/)
  const raw = m?.[1]?.trim()
  return raw || undefined
}

export function parsePatternFromInputSummary(summary: string): string | undefined {
  const m = summary.match(/(?:^|,\s*)pattern=([^,]+)/)
  return m?.[1]?.trim() || undefined
}

export function parseQueryFromInputSummary(summary: string): string | undefined {
  const m = summary.match(/(?:^|,\s*)query=([^,]+)/)
  return m?.[1]?.trim() || undefined
}

export function parseUrlFromInputSummary(summary: string): string | undefined {
  const m = summary.match(/(?:^|,\s*)url=([^,]+)/)
  return m?.[1]?.trim() || undefined
}

export function htmlToTextSnippet(
  html: string,
  maxChars = READ_FILE_PRUNE_PREVIEW_CHARS,
): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

function toolOutputSucceeded(output: Record<string, unknown> | null): boolean {
  if (!output) return true
  if (output.success === false) return false
  if (typeof output.error === 'string' && output.error) return false
  return true
}

function resultUrlsFromSearchResults(
  results: unknown,
  max = 5,
): string[] | undefined {
  if (!Array.isArray(results)) return undefined
  const urls: string[] = []
  for (const item of results) {
    if (!item || typeof item !== 'object') continue
    const url = (item as Record<string, unknown>).url
    if (typeof url === 'string' && url.trim()) urls.push(url.trim())
    if (urls.length >= max) break
  }
  return urls.length > 0 ? urls : undefined
}

function snippetFromSearchResults(results: unknown): string | undefined {
  if (!Array.isArray(results) || results.length === 0) return undefined
  const first = results[0]
  if (!first || typeof first !== 'object') return undefined
  const row = first as Record<string, unknown>
  if (typeof row.snippet === 'string' && row.snippet.trim()) {
    return row.snippet.trim().slice(0, READ_FILE_PRUNE_PREVIEW_CHARS)
  }
  if (typeof row.title === 'string' && row.title.trim()) {
    return row.title.trim().slice(0, READ_FILE_PRUNE_PREVIEW_CHARS)
  }
  return undefined
}

function parseToolOutputJson(outputText: string): Record<string, unknown> | null {
  const trimmed = outputText.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* plain text output */
  }
  return null
}

function parseModifiedAtMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : ms
}

export function resolveExploreSessionStartAt(
  results: readonly StoredToolResult[],
): string | undefined {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i]?.toolName === ENTER_PLAN_MODE_TOOL_NAME) {
      return results[i]?.createdAt
    }
  }
  const toolLoop = results.filter((r) => r.stepId === TOOL_LOOP_STEP_ID)
  return toolLoop[0]?.createdAt
}

export function filterExplorePhaseToolResults(
  results: readonly StoredToolResult[],
): StoredToolResult[] {
  const sessionStart = resolveExploreSessionStartAt(results)
  return results.filter((r) => {
    if (r.stepId !== TOOL_LOOP_STEP_ID) return false
    if (sessionStart && r.createdAt < sessionStart) return false
    if (!MANIFEST_TOOLS.has(r.toolName)) return false
    if (r.isError) return false
    return true
  })
}

function pathContextForConversation(
  conversationId: string,
  sandboxRoot?: string | null,
): ToolPathNormalizeContext {
  return {
    sandboxRoot: sandboxRoot?.trim() || undefined,
    workspacePath: getWorkspacePath(conversationId) ?? undefined,
  }
}

function readFileCacheKey(
  path: string,
  offset?: number,
  limit?: number,
): string {
  return `${path}\0${offset ?? 1}\0${limit ?? ''}`
}

export function buildExploreManifestFromToolResults(args: {
  conversationId: string
  planSlug: string
  results: readonly StoredToolResult[]
  pathContext?: ToolPathNormalizeContext
  updatedAt?: string
}): ExploreFileManifest {
  const pathCtx = args.pathContext ?? { workspacePath: null }
  const exploreResults = filterExplorePhaseToolResults(args.results)

  const fileByKey = new Map<string, ExploreManifestFileEntry>()
  const searches: ExploreManifestSearchEntry[] = []
  const resourceByKey = new Map<string, ExploreManifestResourceEntry>()

  for (const record of exploreResults) {
    const output = parseToolOutputJson(record.outputText)
    if (!toolOutputSucceeded(output)) continue
    const inputPath = parsePathFromInputSummary(record.inputSummary)

    if (record.toolName === 'read_file') {
      if (output && typeof output.error === 'string' && output.error) continue

      const rawPath =
        (typeof output?.path === 'string' && output.path) || inputPath || ''
      if (!rawPath.trim()) continue

      const normalizedInput = normalizeToolInputForDedupeKey(
        'read_file',
        {
          path: rawPath,
          offset: output?.offset,
          limit: output?.limit,
        },
        pathCtx,
      ) as { path: string; offset: number; limit: number }
      const canonicalPath = normalizedInput.path || normalizeToolPathForKey(rawPath, pathCtx)
      const key = readFileCacheKey(
        canonicalPath,
        normalizedInput.offset,
        normalizedInput.limit,
      )

      if (output?.isDirectory === true) {
        if (fileByKey.has(key)) continue
        const entryCount = Array.isArray(output.entries)
          ? output.entries.length
          : undefined
        fileByKey.set(key, {
          path: canonicalPath,
          isDirectory: true,
          ...(entryCount != null ? { entryCount } : {}),
        })
        continue
      }

      const content = typeof output?.content === 'string' ? output.content : undefined
      if (!content) continue
      if (fileByKey.has(key)) continue

      fileByKey.set(key, {
        path: canonicalPath,
        snippet: content.slice(0, READ_FILE_PRUNE_PREVIEW_CHARS),
        offset: normalizedInput.offset,
        limit: normalizedInput.limit,
        mtimeMs: parseModifiedAtMs(output.modifiedAt),
      })
      continue
    }

    if (record.toolName === 'grep_files' || record.toolName === 'glob_files') {
      const pattern =
        parsePatternFromInputSummary(record.inputSummary) ||
        (typeof output?.pattern === 'string' ? output.pattern : undefined)
      if (!pattern) continue

      const rootRaw = inputPath || '.'
      const root = normalizeToolPathForKey(rootRaw, pathCtx)
      let hitCount: number | undefined
      if (Array.isArray(output?.matches)) {
        hitCount = output.matches.length
      } else if (Array.isArray(output?.files)) {
        hitCount = output.files.length
      } else if (typeof output?.count === 'number') {
        hitCount = output.count
      }

      searches.push({
        tool: record.toolName,
        pattern,
        root,
        ...(hitCount != null ? { hitCount } : {}),
      })
      continue
    }

    if (record.toolName === 'web_search') {
      const query =
        (typeof output?.query === 'string' && output.query) ||
        parseQueryFromInputSummary(record.inputSummary)
      if (!query?.trim()) continue
      const key = `web_search\0${query.trim()}`
      if (resourceByKey.has(key)) continue
      resourceByKey.set(key, {
        kind: 'web_search',
        query: query.trim(),
        resultCount:
          typeof output?.resultCount === 'number'
            ? output.resultCount
            : Array.isArray(output?.results)
              ? output.results.length
              : undefined,
        topUrls: resultUrlsFromSearchResults(output?.results),
        snippet: snippetFromSearchResults(output?.results),
      })
      continue
    }

    if (record.toolName === 'web_scrape') {
      const pages = Array.isArray(output?.pages) ? output.pages : []
      for (const page of pages) {
        if (!page || typeof page !== 'object') continue
        const row = page as Record<string, unknown>
        const url = typeof row.url === 'string' ? row.url.trim() : ''
        if (!url) continue
        const key = `web_scrape\0${url}`
        if (resourceByKey.has(key)) continue
        const html = typeof row.html === 'string' ? row.html : ''
        resourceByKey.set(key, {
          kind: 'web_scrape',
          url,
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          snippet: html ? htmlToTextSnippet(html) : undefined,
        })
      }
      continue
    }

    if (record.toolName === 'deep_research') {
      if (output?.listOnly === true) continue
      const query =
        (typeof output?.query === 'string' && output.query) ||
        parseQueryFromInputSummary(record.inputSummary)
      if (!query?.trim()) continue
      const category =
        typeof output?.category === 'string' ? output.category : ''
      const key = `deep_research\0${query.trim()}\0${category}`
      if (resourceByKey.has(key)) continue
      resourceByKey.set(key, {
        kind: 'deep_research',
        query: query.trim(),
        scopeLabel:
          typeof output?.scopeLabel === 'string'
            ? output.scopeLabel.trim()
            : undefined,
        resultCount:
          typeof output?.resultCount === 'number'
            ? output.resultCount
            : Array.isArray(output?.results)
              ? output.results.length
              : undefined,
        topUrls: resultUrlsFromSearchResults(output?.results),
        snippet: snippetFromSearchResults(output?.results),
      })
    }
  }

  const resources = [...resourceByKey.values()].slice(
    0,
    MAX_MANIFEST_RESOURCE_ENTRIES,
  )

  return {
    version: EXPLORE_MANIFEST_VERSION,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
    conversationId: args.conversationId.trim(),
    planSlug: args.planSlug.trim(),
    files: [...fileByKey.values()].slice(0, MAX_MANIFEST_FILE_ENTRIES),
    ...(searches.length > 0
      ? { searches: searches.slice(0, MAX_MANIFEST_SEARCH_ENTRIES) }
      : {}),
    ...(resources.length > 0 ? { resources } : {}),
  }
}

export function formatExploreManifestForInstructions(
  manifest: ExploreFileManifest,
  opts?: { maxChars?: number },
): string {
  const maxChars = opts?.maxChars ?? MAX_MANIFEST_INSTRUCTION_CHARS
  const lines: string[] = [
    '## Explore manifest',
    '',
    'Workspace files and remote resources below were researched during explore mode.',
    'Do not `read_file` listed paths again unless you need a new line range (`offset` from the prior `note`), the file was edited (`reason`), or the manifest snippet is insufficient.',
    'Do not re-run `web_scrape` / `web_search` for the same URLs or queries unless you need fresher data.',
    'Prefer editing listed paths; use `lsp` and read-only `shell` (`rg`/`find`) for symbols not covered below.',
    '',
  ]

  if (manifest.files.length > 0) {
    lines.push('### Files read during explore')
    for (const file of manifest.files) {
      if (file.isDirectory) {
        const count =
          file.entryCount != null ? `, ${file.entryCount} entries` : ''
        lines.push(`- \`${file.path}\` (directory${count})`)
        continue
      }
      lines.push(`- \`${file.path}\``)
      if (file.snippet?.trim()) {
        lines.push('  ```')
        lines.push(file.snippet.trimEnd())
        lines.push('  ```')
      }
    }
    lines.push('')
  }

  if (manifest.searches?.length) {
    lines.push('### Repo searches run during explore')
    for (const search of manifest.searches) {
      const hits =
        search.hitCount != null ? ` (${search.hitCount} hits)` : ''
      lines.push(
        `- \`${search.tool}\` pattern \`${search.pattern}\` under \`${search.root}\`${hits}`,
      )
    }
    lines.push('')
  }

  if (manifest.resources?.length) {
    lines.push('### Remote resources researched during explore')
    for (const resource of manifest.resources) {
      if (resource.kind === 'web_scrape' && resource.url) {
        const title = resource.title ? ` — ${resource.title}` : ''
        lines.push(`- \`web_scrape\` ${resource.url}${title}`)
      } else if (
        resource.kind === 'web_search' ||
        resource.kind === 'deep_research'
      ) {
        const scope =
          resource.scopeLabel != null ? ` (${resource.scopeLabel})` : ''
        const count =
          resource.resultCount != null ? `, ${resource.resultCount} results` : ''
        lines.push(
          `- \`${resource.kind}\` query \`${resource.query}\`${scope}${count}`,
        )
        if (resource.topUrls?.length) {
          lines.push(`  URLs: ${resource.topUrls.join(', ')}`)
        }
      }
      if (resource.snippet?.trim()) {
        lines.push('  ```')
        lines.push(resource.snippet.trimEnd())
        lines.push('  ```')
      }
    }
    lines.push('')
  }

  let text = lines.join('\n').trimEnd()
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 40)}\n\n…[manifest truncated]`
  }
  return text
}

export function readExploreManifest(
  conversationId: string,
  options?: PlanModeStorageOptions,
): ExploreFileManifest | null {
  const storage = resolvePlanModeStorage(conversationId, options)
  if (!storage) return null
  const file = storage.manifestFile.absolutePath
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return parseExploreFileManifest(raw)
  } catch {
    return null
  }
}

export function writeExploreManifest(
  conversationId: string,
  manifest: ExploreFileManifest,
  options?: PlanModeStorageOptions,
): boolean {
  const storage = resolvePlanModeStorage(conversationId, options)
  if (!storage) return false
  ensurePlanModePlansDir(storage.plansDirAbs)
  writeFileSync(
    storage.manifestFile.absolutePath,
    JSON.stringify(manifest, null, 2),
    'utf8',
  )
  return true
}

export function clearExploreManifest(
  conversationId: string,
  options?: PlanModeStorageOptions,
): void {
  const storage = resolvePlanModeStorage(conversationId, options)
  if (!storage) return
  const file = storage.manifestFile.absolutePath
  if (existsSync(file)) {
    unlinkSync(file)
  }
}

export function buildAndPersistExploreManifest(
  conversationId: string,
  planSlug: string,
  options?: PlanModeStorageOptions,
): ExploreFileManifest | null {
  const id = conversationId.trim()
  if (!id || !planSlug.trim()) return null

  const storage = resolvePlanModeStorage(id, options)
  const pathCtx = pathContextForConversation(id, storage?.sandboxRoot)

  const results = getConversationStore().listToolResults(id, { limit: 500 })
  const manifest = buildExploreManifestFromToolResults({
    conversationId: id,
    planSlug: planSlug.trim(),
    results,
    pathContext: pathCtx,
  })

  if (!writeExploreManifest(id, manifest, options)) return null
  return manifest
}
