import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { extname, isAbsolute, join } from 'path'
import { resolveSkillsSources } from '@main/skills/skill-path'
import { createLogger } from '@main/logger'
import type { AgentStepContext } from '../context'
import { LINK_EXPAND } from '../constants/pipeline'

const log = createLogger('agent.steps.ref-links')

const MAX_BODY_PER_LINK = 100_000
const MAX_TOTAL_APPENDED = 200_000
const FETCH_TIMEOUT_MS = 25_000

/**
 * Reference targets inlined from markdown links are read as UTF-8 text.
 * Paths/URLs whose file extension is one of these are loaded; other extensions
 * are skipped so binary assets are not pulled into the system prompt.
 * Extensionless paths are still attempted (e.g. bare filenames or some raw URLs).
 */
export const REFERENCE_LINK_TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.sh',
  '.bash',
  '.js',
  '.mjs',
  '.cjs',
  '.py',
])

function pathnameExtFromHref(
  href: string,
  references: AgentStepContext['references'],
): string {
  const raw = href.trim().replace(/^<|>$/g, '')
  try {
    if (references.isRemoteReferenceUrl(raw)) {
      const u = new URL(raw)
      return extname(u.pathname).toLowerCase()
    }
  } catch {
    /* fall through */
  }
  const pathPart = raw.split(/[?#]/)[0] ?? raw
  return extname(pathPart).toLowerCase()
}

/** True if we should try to load this href as text (allowed ext, or no ext). */
export function isExpandableReferenceTextHref(
  href: string,
  references: AgentStepContext['references'],
): boolean {
  const ext = pathnameExtFromHref(href, references)
  if (!ext) return true
  return REFERENCE_LINK_TEXT_EXTENSIONS.has(ext)
}

export function normalizeMarkdownHrefKey(
  href: string,
  references: AgentStepContext['references'],
): string {
  const raw = href.trim().replace(/^<|>$/g, '')
  if (references.isRemoteReferenceUrl(raw)) {
    try {
      const u = new URL(raw)
      u.hash = ''
      return u.href
    } catch {
      return raw.toLowerCase()
    }
  }
  return raw.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

/** Options for {@link appendLinkedMarkdownReferenceSections}. */
export type AppendLinkedMarkdownOptions = {
  /**
   * Keys from {@link normalizeMarkdownHrefKey} for targets already inlined in the
   * same prompt (e.g. `REFERENCE MATERIALS` from planned `reference_doc`). Skips
   * expanding those links so the appendix does not duplicate that content.
   */
  skipExpandHrefKeys?: ReadonlySet<string>
}

/**
 * Normalized href keys for planned reference docs/scripts (pass to
 * {@link AppendLinkedMarkdownOptions.skipExpandHrefKeys}).
 */
export function collectPlannedReferenceHrefKeys(
  references: AgentStepContext['references'],
  docs: readonly { reference_url?: string }[],
  scripts: readonly { reference_url?: string }[],
): Set<string> {
  const keys = new Set<string>()
  for (const d of docs) {
    const u = d.reference_url?.trim()
    if (u) keys.add(normalizeMarkdownHrefKey(u, references))
  }
  for (const s of scripts) {
    const u = s.reference_url?.trim()
    if (u) keys.add(normalizeMarkdownHrefKey(u, references))
  }
  return keys
}

function shouldSkipHref(href: string): boolean {
  const h = href.trim().toLowerCase()
  if (!h) return true
  if (h.startsWith('mailto:') || h.startsWith('javascript:') || h === '#')
    return true
  return false
}

/** Markdown ```lang fence for inlined linked bodies when the URL/path implies a language. */
function markdownFenceLanguageForLinkedHref(
  href: string,
  references: AgentStepContext['references'],
): string | null {
  const ext = pathnameExtFromHref(href, references)
  switch (ext) {
    case '.py':
      return 'python'
    case '.sh':
    case '.bash':
      return 'bash'
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript'
    case '.md':
    case '.markdown':
      return 'markdown'
    default:
      return null
  }
}

/** Markdown links `[label](href)` excluding images `![...](...)`. */
export function extractMarkdownLinks(
  text: string,
  references: AgentStepContext['references'],
): { label: string; href: string }[] {
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  const out: { label: string; href: string }[] = []
  const seenHref = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const idx = m.index
    if (idx > 0 && text[idx - 1] === '!') continue
    const href = m[2].trim()
    if (shouldSkipHref(href)) continue
    const key = normalizeMarkdownHrefKey(href, references)
    if (seenHref.has(key)) continue
    seenHref.add(key)
    out.push({ label: m[1].trim(), href })
  }
  return out
}

async function fetchRemoteAsText(
  url: string,
  references: AgentStepContext['references'],
  abortSignal?: AbortSignal,
): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const ms = FETCH_TIMEOUT_MS
  let signal: AbortSignal
  if (abortSignal) {
    try {
      signal = AbortSignal.any([
        abortSignal,
        AbortSignal.timeout(ms),
      ] as AbortSignal[])
    } catch {
      signal = abortSignal
    }
  } else {
    signal = AbortSignal.timeout(ms)
  }
  try {
    const trimmed = url.trim()
    if (!isExpandableReferenceTextHref(trimmed, references)) {
      return {
        ok: false,
        error: LINK_EXPAND.UNSUPPORTED_EXTENSION.replace(
          '{extensions}',
          [...REFERENCE_LINK_TEXT_EXTENSIONS].sort().join(', '),
        ),
      }
    }
    const res = await fetch(trimmed, { signal, redirect: 'follow' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    if (ct.includes('application/json')) {
      const j: unknown = await res.json()
      return { ok: true, body: JSON.stringify(j, null, 2) }
    }
    return { ok: true, body: await res.text() }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function loadLocalHrefBody(
  href: string,
  ctx: AgentStepContext,
): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const h = href.trim().replace(/^<|>$/g, '')
  if (!isExpandableReferenceTextHref(h, ctx.references)) {
    return {
      ok: false,
      error: `Unsupported reference extension (use text types: ${[...REFERENCE_LINK_TEXT_EXTENSIONS].sort().join(', ')})`,
    }
  }
  const skillId = ctx.opts.skillId?.trim()
  const sandboxLayout = ctx.sandbox.layout

  const tryRead = async (abs: string) => {
    if (!existsSync(abs)) return null
    try {
      const body = await readFile(abs, 'utf-8')
      return body
    } catch {
      return null
    }
  }

  if (isAbsolute(h)) {
    const body = await tryRead(h)
    if (body != null) return { ok: true, body }
    return { ok: false, error: LINK_EXPAND.NOT_FOUND.replace('{path}', h) }
  }

  if (sandboxLayout) {
    const resolved = ctx.references.resolveLocalSourcePathForReferenceCopy(
      h,
      sandboxLayout,
      skillId,
    )
    if (resolved) {
      const body = await tryRead(resolved)
      if (body != null) return { ok: true, body }
    }
  }

  const { bundled, user } = resolveSkillsSources()
  const rel = h.replace(/^[/\\]+/, '')

  if (skillId) {
    for (const root of [user, bundled]) {
      const underSkill = join(root, skillId, rel)
      const body = await tryRead(underSkill)
      if (body != null) return { ok: true, body }
    }
  }

  for (const root of [user, bundled]) {
    const underSkills = join(root, rel)
    const bodySkills = await tryRead(underSkills)
    if (bodySkills != null) return { ok: true, body: bodySkills }
  }

  if (sandboxLayout?.root) {
    const underRoot = join(sandboxLayout.root, h.replace(/^[/\\]+/, ''))
    const bodyRoot = await tryRead(underRoot)
    if (bodyRoot != null) return { ok: true, body: bodyRoot }
  }

  return { ok: false, error: LINK_EXPAND.COULD_NOT_RESOLVE.replace('{path}', h) }
}

/** Load local or remote markdown/reference targets for pipeline prompts. */
export async function loadHrefBody(
  href: string,
  ctx: AgentStepContext,
): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const h = href.trim().replace(/^<|>$/g, '')
  if (ctx.references.isRemoteReferenceUrl(h)) {
    return fetchRemoteAsText(h, ctx.references, ctx.opts.abortSignal)
  }
  return loadLocalHrefBody(h, ctx)
}

/**
 * Finds markdown links in `system`, loads each target **once per agent run** (cached on
 * {@link AgentFlowContext.markdownReferenceBodyByKey}), and appends one appendix with
 * inlined bodies. Every non-skipped `[label](href)` in `system` is considered.
 *
 * Reference files are read as UTF-8 text. Supported file extensions include
 * `.md`, `.txt`, `.sh`, `.js` (and `.mjs`/`.cjs`), and `.py` — see
 * {@link REFERENCE_LINK_TEXT_EXTENSIONS}. Links with other extensions (e.g. images)
 * are skipped. Extensionless URLs/paths are still attempted.
 * {@link AppendLinkedMarkdownOptions.skipExpandHrefKeys} can suppress expansion for
 * URLs/paths already inlined elsewhere in the same `system` string (e.g. reference
 * materials from planning).
 */
export async function appendLinkedMarkdownReferenceSections(
  system: string,
  ctx: AgentStepContext,
  options?: AppendLinkedMarkdownOptions,
): Promise<string> {
  const links = extractMarkdownLinks(system, ctx.references)
  if (links.length === 0) return system

  const sections: string[] = []
  let totalAppended = 0
  const usedInThisCall = new Set<string>()
  const skipKeys = options?.skipExpandHrefKeys

  for (const { label, href } of links) {
    const key = normalizeMarkdownHrefKey(href, ctx.references)
    if (skipKeys?.has(key)) continue
    if (usedInThisCall.has(key)) continue
    usedInThisCall.add(key)

    let body: string | undefined = ctx.getCachedMarkdownReferenceBody(key)
    if (body === undefined) {
      const loaded = await loadHrefBody(href, ctx)
      if (loaded.ok === false) {
        log.debug('Skipped markdown link (unresolved)', { href, err: loaded.error })
        continue
      }
      body =
        loaded.body.length > MAX_BODY_PER_LINK
          ? `${loaded.body.slice(0, MAX_BODY_PER_LINK)}\n\n${LINK_EXPAND.TRUNCATED}`
          : loaded.body
      ctx.cacheMarkdownReferenceBody(key, body)
    }

    if (totalAppended + body.length > MAX_TOTAL_APPENDED) {
      sections.push(
        `\n${LINK_EXPAND.OMITTED_SIZE.replace('{max}', String(MAX_TOTAL_APPENDED))}\n`,
      )
      break
    }

    const fenceLang = markdownFenceLanguageForLinkedHref(href, ctx.references)
    const bodyMd = fenceLang
      ? `\`\`\`${fenceLang}\n${body}\n\`\`\``
      : body

    sections.push(
      `${LINK_EXPAND.LINKED_REFERENCE_HEADER.replace('{label}', label || href)}\n${LINK_EXPAND.LINKED_REFERENCE_SOURCE.replace('{href}', href)}\n\n${bodyMd}\n`,
    )
    totalAppended += sections[sections.length - 1].length
  }

  if (sections.length === 0) return system

  return `${system}\n\n---\n${LINK_EXPAND.EXPANDED_LINKS_SECTION}\n\n${sections.join('\n')}`
}
