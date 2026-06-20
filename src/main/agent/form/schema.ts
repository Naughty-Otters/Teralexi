import { createLogger, traceFunction } from '@main/logger'

/** How to extract option strings from artifact or markdown body text. */
export type FormFieldOptionsParse = 'bullets' | 'json-array'

/**
 * Bind a form value to a prior-step sandbox artifact (usually `form-projection.json`).
 * When `jsonPath` is set, reads structured JSON; otherwise uses markdown/bullet parsing.
 */
export type FormProjectionBindingSpec = {
  /** Filename or path suffix under sandbox `output/` (defaults to schema `projectionArtifact`). */
  artifact?: string
  /** Dot path from projection root, e.g. `$.title` or `$.options.tag_filter`. */
  jsonPath?: string
}

/** @deprecated Alias for {@link FormProjectionBindingSpec} on select fields. */
export type FormFieldOptionsFromSpec = FormProjectionBindingSpec & {
  /** `## Heading` in the form doc; bullet lines become options. */
  markdownHeading?: string
  parse?: FormFieldOptionsParse
}

/**
 * Parses optional machine-readable form field specs from skill markdown.
 *
 * Supported:
 * - Fenced ```json block or HTML comment `<!-- FORM_SCHEMA {...} -->`
 *
 * Top-level keys:
 * - `title`, `message` — static copy
 * - `titleFrom`, `messageFrom` — bind to prior-step projection JSON (`jsonPath`)
 * - `projectionArtifact` — default artifact (default `form-projection.json`)
 * - `fields` — field definitions
 *
 * Prior step should write projection JSON, e.g.:
 * `{ "title": "…", "message": "…", "options": { "tag_filter": ["life", "love"] } }`
 *
 * Field types: `string`, `text`, `number`, `boolean`, `select` (alias: `dropdown`).
 * `select` uses static `options`, `optionsFrom.jsonPath`, and/or legacy artifact bullets.
 */

export type ParsedCollectFormSchema = {
  title?: string
  message?: string
  titleFrom?: FormProjectionBindingSpec
  messageFrom?: FormProjectionBindingSpec
  projectionArtifact?: string
  fields: CollectFormField[]
}

export type ResolvedCollectForm = {
  title?: string
  message?: string
  fields: CollectFormField[]
}

export type CollectFormSelectOption = {
  value: string
  label: string
}

export type CollectFormField = {
  key: string
  label: string
  type: 'string' | 'text' | 'number' | 'boolean' | 'select'
  required?: boolean
  placeholder?: string
  /** Allowed choices when `type` is `select`. */
  options?: CollectFormSelectOption[]
  /** Resolved at form load from prior step output (stripped before UI emit). */
  optionsFrom?: FormFieldOptionsFromSpec
}

const defaultFields: CollectFormField[] = [
  {
    key: 'notes',
    label: 'Notes',
    type: 'text',
    required: false,
    placeholder: 'Optional context for this step',
  },
]
const log = createLogger('form.schema')

type RawFormField = {
  key?: unknown
  label?: unknown
  type?: unknown
  required?: unknown
  placeholder?: unknown
  options?: unknown
  optionsFrom?: unknown
}

/** Normalizes schema `options` to `{ value, label }[]`. */
export function normalizeSelectOptions(
  raw: unknown,
): CollectFormSelectOption[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: CollectFormSelectOption[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string') {
      const value = item.trim()
      if (!value || seen.has(value)) continue
      seen.add(value)
      out.push({ value, label: value })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const row = item as { value?: unknown; label?: unknown }
    const value =
      typeof row.value === 'string'
        ? row.value.trim()
        : typeof row.value === 'number' && Number.isFinite(row.value)
          ? String(row.value)
          : ''
    if (!value || seen.has(value)) continue
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : value
    seen.add(value)
    out.push({ value, label })
  }
  return out.length > 0 ? out : undefined
}

export function getSelectOptionValues(
  options: CollectFormSelectOption[],
): string[] {
  return options.map((o) => o.value)
}

/** Maps user or model text to a canonical option `value`, if possible. */
export function resolveSelectValue(
  field: CollectFormField,
  raw: unknown,
): string | undefined {
  if (field.type !== 'select' || !field.options?.length) return undefined
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  const lower = s.toLowerCase()
  for (const opt of field.options) {
    if (opt.value === s || opt.value.toLowerCase() === lower) return opt.value
    if (opt.label === s || opt.label.toLowerCase() === lower) return opt.value
  }
  return undefined
}

export function isAllowedSelectValue(
  field: CollectFormField,
  value: unknown,
): boolean {
  if (field.type !== 'select' || !field.options?.length) return true
  return resolveSelectValue(field, value) !== undefined
}

function parseFormSchemaJson(parsed: Record<string, unknown>): ParsedCollectFormSchema | null {
  const fieldsRaw = parsed.fields
  if (!Array.isArray(fieldsRaw) || fieldsRaw.length === 0) return null

  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : undefined
  const message =
    typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : undefined
  const projectionArtifact =
    typeof parsed.projectionArtifact === 'string' &&
    parsed.projectionArtifact.trim()
      ? parsed.projectionArtifact.trim()
      : undefined

  return {
    title,
    message,
    titleFrom: parseProjectionBindingRaw(parsed.titleFrom),
    messageFrom: parseProjectionBindingRaw(parsed.messageFrom),
    projectionArtifact,
    fields: normalizeFields(fieldsRaw as RawFormField[]),
  }
}

function parseFormSchemaFromMarkdownImpl(markdown: string): ParsedCollectFormSchema {
  const text = markdown ?? ''

  const comment = text.match(/<!--\s*FORM_SCHEMA\s*([\s\S]*?)\s*-->/i)
  if (comment?.[1]) {
    try {
      const parsed = JSON.parse(comment[1].trim()) as Record<string, unknown>
      const schema = parseFormSchemaJson(parsed)
      if (schema) return schema
    } catch {
      /* fall through */
    }
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    try {
      const parsed = JSON.parse(fence[1].trim()) as Record<string, unknown>
      const schema = parseFormSchemaJson(parsed)
      if (schema) return schema
    } catch {
      /* fall through */
    }
  }

  return { fields: defaultFields }
}

function parseFormFieldsFromMarkdownImpl(markdown: string): CollectFormField[] {
  return parseFormSchemaFromMarkdownImpl(markdown).fields
}

function parseProjectionBindingRaw(
  raw: unknown,
): FormProjectionBindingSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const artifact =
    typeof row.artifact === 'string' && row.artifact.trim()
      ? row.artifact.trim()
      : undefined
  const jsonPath =
    typeof row.jsonPath === 'string' && row.jsonPath.trim()
      ? row.jsonPath.trim()
      : undefined
  if (!artifact && !jsonPath) return undefined
  return { artifact, jsonPath }
}

function parseOptionsFromRaw(raw: unknown): FormFieldOptionsFromSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const artifact =
    typeof row.artifact === 'string' && row.artifact.trim()
      ? row.artifact.trim()
      : undefined
  const markdownHeading =
    typeof row.markdownHeading === 'string' && row.markdownHeading.trim()
      ? row.markdownHeading.trim()
      : undefined
  const jsonPath =
    typeof row.jsonPath === 'string' && row.jsonPath.trim()
      ? row.jsonPath.trim()
      : undefined
  const parse =
    row.parse === 'json-array' || row.parse === 'bullets' ? row.parse : undefined
  if (!artifact && !markdownHeading && !jsonPath) return undefined
  return { artifact, markdownHeading, jsonPath, parse }
}

function normalizeFields(raw: RawFormField[]): CollectFormField[] {
  const out: CollectFormField[] = []
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue
    const key = typeof f.key === 'string' ? f.key.trim() : ''
    const label = typeof f.label === 'string' ? f.label.trim() : key
    if (!key) continue

    const rawType =
      typeof f.type === 'string' ? f.type.trim().toLowerCase() : ''
    const placeholder =
      typeof f.placeholder === 'string' ? f.placeholder : undefined
    const required = !!f.required

    if (
      rawType === 'select' ||
      rawType === 'dropdown' ||
      rawType === 'enum'
    ) {
      const options = normalizeSelectOptions(f.options)
      const optionsFrom = parseOptionsFromRaw(f.optionsFrom)
      if (options || optionsFrom) {
        out.push({
          key,
          label: label || key,
          type: 'select',
          required,
          placeholder,
          ...(options ? { options } : {}),
          ...(optionsFrom ? { optionsFrom } : {}),
        })
        continue
      }
    }

    const type =
      rawType === 'number' || rawType === 'boolean' || rawType === 'text'
        ? rawType
        : 'string'
    out.push({
      key,
      label: label || key,
      type,
      required,
      placeholder,
    })
  }
  return out.length > 0 ? out : defaultFields
}

export const parseFormSchemaFromMarkdown = traceFunction(
  log,
  'parseFormSchemaFromMarkdown',
  parseFormSchemaFromMarkdownImpl,
)

export const parseFormFieldsFromMarkdown = traceFunction(
  log,
  'parseFormFieldsFromMarkdown',
  parseFormFieldsFromMarkdownImpl,
)

/** Validates inferred or submitted form values against the schema. */
export function formValuesSatisfyRequired(
  fields: CollectFormField[],
  values: Record<string, unknown>,
): boolean {
  for (const field of fields) {
    const v = values[field.key]
    if (field.type === 'boolean') {
      if (field.required && typeof v !== 'boolean') return false
      continue
    }
    if (field.type === 'select') {
      const resolved = resolveSelectValue(field, v)
      if (field.required && resolved === undefined) return false
      if (
        v !== undefined &&
        v !== null &&
        String(v).trim() !== '' &&
        resolved === undefined
      ) {
        return false
      }
      continue
    }
    if (!field.required) continue
    if (v === undefined || v === null || String(v).trim() === '') return false
  }
  return true
}
