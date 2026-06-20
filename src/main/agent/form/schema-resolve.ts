import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  FORM_PROJECTION_ARTIFACT_DEFAULT,
  coerceProjectionString,
  getJsonPathValue,
  parseJsonObjectFromContent,
} from './form-projection'
import {
  type CollectFormField,
  type CollectFormSelectOption,
  type FormFieldOptionsFromSpec,
  type FormFieldOptionsParse,
  type FormProjectionBindingSpec,
  type ParsedCollectFormSchema,
  type ResolvedCollectForm,
  normalizeSelectOptions,
  parseFormSchemaFromMarkdown,
} from './schema'

export type FormSchemaResolveContext = {
  sandboxRoot?: string
}

/** Bullet / numbered list items under an optional markdown heading. */
export function extractBulletListFromMarkdown(
  markdown: string,
  heading?: string,
): string[] {
  let section = markdown
  if (heading?.trim()) {
    const escaped = heading.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      `^#{1,6}\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=^#{1,6}\\s)`,
      'im',
    )
    const match = markdown.match(re)
    section = match?.[1] ?? ''
  }

  const items: string[] = []
  const seen = new Set<string>()
  for (const line of section.split(/\r?\n/)) {
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/)
    if (!bullet) continue
    let text = bullet[1]
      .trim()
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*|__/g, '')
      .trim()
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    items.push(text)
  }
  return items
}

/** JSON string array or `{ "tags": [...] }` / `{ "top_tags_today": [...] }`. */
export function extractJsonArrayFromContent(content: string): string[] {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1]?.trim(), content.trim()].filter(Boolean) as string[]
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => String(v).trim())
          .filter(Boolean)
      }
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        for (const key of ['tags', 'top_tags_today', 'topTagsToday', 'items']) {
          const arr = obj[key]
          if (Array.isArray(arr)) {
            return arr.map((v) => String(v).trim()).filter(Boolean)
          }
        }
      }
    } catch {
      /* try next */
    }
  }
  return []
}

export function extractOptionsFromContent(
  content: string,
  parse: FormFieldOptionsParse = 'bullets',
): string[] {
  if (parse === 'json-array') {
    const jsonItems = extractJsonArrayFromContent(content)
    if (jsonItems.length > 0) return jsonItems
  }
  return extractBulletListFromMarkdown(content)
}

/** Newest matching file under sandbox `output/` (toolLoop + legacy results). */
export async function findSandboxArtifactContent(
  sandboxRoot: string,
  artifactPattern: string,
): Promise<string | null> {
  const normalized = artifactPattern.replace(/\\/g, '/').replace(/^\*\*\//, '')
  const fileName = basename(normalized)
  const suffix = normalized.includes('/')
    ? normalized.replace(/^\/+/, '')
    : undefined

  const searchRoots = [
    join(sandboxRoot, 'output', 'toolLoop'),
    join(sandboxRoot, 'output', 'results'),
    join(sandboxRoot, 'output'),
  ]

  const matches: { path: string; mtime: number }[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const fullPath = join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!ent.isFile()) continue
      const rel = fullPath.replace(/\\/g, '/')
      const hit =
        ent.name === fileName ||
        (suffix !== undefined && rel.endsWith(suffix))
      if (!hit) continue
      try {
        const st = await stat(fullPath)
        matches.push({ path: fullPath, mtime: st.mtimeMs })
      } catch {
        /* skip */
      }
    }
  }

  await Promise.all(searchRoots.map(walk))
  if (matches.length === 0) return null
  matches.sort((a, b) => b.mtime - a.mtime)
  try {
    return await readFile(matches[0]!.path, 'utf-8')
  } catch {
    return null
  }
}

type ProjectionCache = Map<string, Record<string, unknown> | null>

function resolveArtifactName(
  spec: FormProjectionBindingSpec | FormFieldOptionsFromSpec | undefined,
  schemaDefaultArtifact?: string,
): string | undefined {
  return (
    spec?.artifact?.trim() ||
    schemaDefaultArtifact?.trim() ||
    undefined
  )
}

async function loadProjectionArtifact(
  sandboxRoot: string | undefined,
  artifact: string,
  cache: ProjectionCache,
): Promise<Record<string, unknown> | null> {
  const key = artifact.trim()
  if (!key) return null
  if (cache.has(key)) return cache.get(key) ?? null
  if (!sandboxRoot?.trim()) {
    cache.set(key, null)
    return null
  }

  const body = await findSandboxArtifactContent(sandboxRoot.trim(), key)
  const parsed = body ? parseJsonObjectFromContent(body) : null
  cache.set(key, parsed)
  return parsed
}

async function resolveStringFromBinding(
  binding: FormProjectionBindingSpec | undefined,
  ctx: FormSchemaResolveContext,
  cache: ProjectionCache,
  schemaDefaultArtifact?: string,
): Promise<string | undefined> {
  if (!binding?.jsonPath?.trim()) return undefined

  const artifact =
    resolveArtifactName(binding, schemaDefaultArtifact) ??
    FORM_PROJECTION_ARTIFACT_DEFAULT
  const projection = await loadProjectionArtifact(
    ctx.sandboxRoot,
    artifact,
    cache,
  )
  if (!projection) return undefined
  return coerceProjectionString(getJsonPathValue(projection, binding.jsonPath))
}

function optionsFromJsonValue(value: unknown): CollectFormSelectOption[] | undefined {
  if (Array.isArray(value)) {
    return normalizeSelectOptions(value)
  }
  return undefined
}

export async function resolveOptionsFromSpec(
  spec: FormFieldOptionsFromSpec,
  formMarkdown: string,
  ctx: FormSchemaResolveContext,
  staticOptions?: CollectFormSelectOption[],
  resolveParams?: {
    fieldKey?: string
    schemaDefaultArtifact?: string
    projectionCache?: ProjectionCache
  },
): Promise<CollectFormSelectOption[] | undefined> {
  const cache = resolveParams?.projectionCache ?? new Map()
  const merged: string[] = []
  const seen = new Set<string>()
  const addStrings = (items: string[]) => {
    for (const item of items) {
      const v = item.trim()
      if (!v || seen.has(v.toLowerCase())) continue
      seen.add(v.toLowerCase())
      merged.push(v)
    }
  }

  if (staticOptions?.length) {
    addStrings(staticOptions.map((o) => o.value))
  }

  if (spec.markdownHeading) {
    addStrings(
      extractBulletListFromMarkdown(formMarkdown, spec.markdownHeading),
    )
  }

  const artifactName = resolveArtifactName(spec, resolveParams?.schemaDefaultArtifact)
  const usesProjectionJson =
    !spec.markdownHeading &&
    !spec.parse &&
    (!artifactName ||
      artifactName === FORM_PROJECTION_ARTIFACT_DEFAULT ||
      artifactName.endsWith('.json'))

  const jsonPath =
    spec.jsonPath?.trim() ||
    (usesProjectionJson && resolveParams?.fieldKey
      ? `$.options.${resolveParams.fieldKey}`
      : undefined)

  if (jsonPath) {
    const artifact =
      resolveArtifactName(spec, resolveParams?.schemaDefaultArtifact) ??
      FORM_PROJECTION_ARTIFACT_DEFAULT
    const projection = await loadProjectionArtifact(
      ctx.sandboxRoot,
      artifact,
      cache,
    )
    const fromJson = projection
      ? optionsFromJsonValue(getJsonPathValue(projection, jsonPath))
      : undefined
    if (fromJson?.length) {
      return fromJson
    }
  }

  if (spec.artifact && ctx.sandboxRoot?.trim() && !jsonPath) {
    const body = await findSandboxArtifactContent(
      ctx.sandboxRoot.trim(),
      spec.artifact,
    )
    if (body) {
      addStrings(
        extractOptionsFromContent(body, spec.parse ?? 'bullets'),
      )
    }
  }

  return normalizeSelectOptions(merged)
}

async function resolvePresentation(
  schema: ParsedCollectFormSchema,
  ctx: FormSchemaResolveContext,
  cache: ProjectionCache,
): Promise<{ title?: string; message?: string }> {
  const defaultArtifact =
    schema.projectionArtifact?.trim() || FORM_PROJECTION_ARTIFACT_DEFAULT

  const titleFromBinding = await resolveStringFromBinding(
    schema.titleFrom,
    ctx,
    cache,
    defaultArtifact,
  )
  const messageFromBinding = await resolveStringFromBinding(
    schema.messageFrom,
    ctx,
    cache,
    defaultArtifact,
  )

  return {
    title: schema.title?.trim() || titleFromBinding,
    message: schema.message?.trim() || messageFromBinding,
  }
}

/** Resolves fields, title, and message from form markdown + prior-step projection JSON. */
export async function resolveCollectFormFromMarkdown(
  markdown: string,
  ctx: FormSchemaResolveContext = {},
): Promise<ResolvedCollectForm> {
  const schema = parseFormSchemaFromMarkdown(markdown)
  const cache: ProjectionCache = new Map()
  const presentation = await resolvePresentation(schema, ctx, cache)
  const schemaDefaultArtifact =
    schema.projectionArtifact?.trim() || FORM_PROJECTION_ARTIFACT_DEFAULT
  const resolvedFields: CollectFormField[] = []

  for (const field of schema.fields) {
    const spec = field.optionsFrom
    if (field.type !== 'select' || !spec) {
      const { optionsFrom: _drop, ...rest } = field
      resolvedFields.push(rest)
      continue
    }

    const options = await resolveOptionsFromSpec(
      spec,
      markdown,
      ctx,
      field.options,
      {
        fieldKey: field.key,
        schemaDefaultArtifact,
        projectionCache: cache,
      },
    )
    const { optionsFrom: _drop, ...rest } = field

    if (options?.length) {
      resolvedFields.push({ ...rest, type: 'select', options })
      continue
    }

    resolvedFields.push({
      ...rest,
      type: 'string',
      placeholder:
        rest.placeholder ??
        'Prior step output not found yet — enter a value manually',
    })
  }

  return {
    ...presentation,
    fields: resolvedFields,
  }
}

/** Applies `optionsFrom` on select fields using sandbox artifacts + form markdown. */
export async function resolveFormFieldsFromMarkdown(
  markdown: string,
  ctx: FormSchemaResolveContext = {},
): Promise<CollectFormField[]> {
  const resolved = await resolveCollectFormFromMarkdown(markdown, ctx)
  return resolved.fields
}
