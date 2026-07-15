import type { UIMessage } from '@teralexi-ai'

export type SubmittedFormFieldView = {
  key: string
  label: string
  value: string
}

export type SubmittedFormView = {
  requestId: string
  fields: SubmittedFormFieldView[]
}

const FORM_RESPONSE_PERSIST_RE =
  /^\[data-collect-form-response(?::([^\]]*))?\]\s*\n?([\s\S]*)$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!spaced) return key
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function fieldsFromValues(
  values: Record<string, unknown>,
): SubmittedFormFieldView[] {
  return Object.entries(values).map(([key, value]) => ({
    key,
    label: humanizeFieldKey(key),
    value: formatFieldValue(value),
  }))
}

/** Parse persisted HITL form-submit text written by the chat transport / main process. */
export function parsePersistedCollectFormResponse(
  text: string,
): { requestId: string; values: Record<string, unknown> } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = trimmed.match(FORM_RESPONSE_PERSIST_RE)
  if (!match) return null
  const requestId = (match[1] ?? '').trim()
  const body = (match[2] ?? '').trim()
  if (!body) {
    return { requestId, values: {} }
  }
  try {
    const parsed = JSON.parse(body) as unknown
    if (!isRecord(parsed)) return { requestId, values: {} }
    const values = isRecord(parsed.values) ? parsed.values : parsed
    return { requestId, values }
  } catch {
    return { requestId, values: {} }
  }
}

function submittedFormFromResponsePart(
  part: Record<string, unknown>,
): SubmittedFormView | null {
  if (part.type !== 'data-collect-form-response') return null
  const requestId = typeof part.id === 'string' ? part.id.trim() : ''
  const data = part.data
  if (!isRecord(data)) {
    return { requestId, fields: [] }
  }
  const values = isRecord(data.values) ? data.values : data
  return {
    requestId,
    fields: fieldsFromValues(values),
  }
}

/** Structured submitted-form view for user bubbles (live parts or persisted text). */
export function userSubmittedFormView(m: UIMessage): SubmittedFormView | null {
  for (const part of m.parts) {
    if (!part || typeof part !== 'object') continue
    const fromPart = submittedFormFromResponsePart(part as Record<string, unknown>)
    if (fromPart) return fromPart
  }

  for (const part of m.parts) {
    if (part.type !== 'text' || typeof part.text !== 'string') continue
    const persisted = parsePersistedCollectFormResponse(part.text)
    if (!persisted) continue
    return {
      requestId: persisted.requestId,
      fields: fieldsFromValues(persisted.values),
    }
  }
  return null
}

/** Plain text parts only (excludes form-response meta parts / persisted form dumps). */
export function userMessagePlainText(m: UIMessage): string {
  return m.parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string',
    )
    .map((p) => p.text)
    .filter((text) => !parsePersistedCollectFormResponse(text))
    .join('')
    .trim()
}

/** Short label when user message contains a form submit (fallback for empty values). */
export function userCollectFormResponseChipLabel(m: UIMessage): string | null {
  const view = userSubmittedFormView(m)
  if (!view) return null
  const n = view.fields.length
  return n > 0 ? `Form submitted (${n} fields)` : 'Form submitted'
}
