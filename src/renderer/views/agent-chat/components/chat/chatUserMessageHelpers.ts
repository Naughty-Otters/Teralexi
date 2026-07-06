import type { UIMessage } from '@teralexi-ai'

/** Plain text parts only (excludes form-response meta parts for layout). */
export function userMessagePlainText(m: UIMessage): string {
  return m.parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string',
    )
    .map((p) => p.text)
    .join('')
    .trim()
}

/** Short label when user message contains `data-collect-form-response` (HITL form submit). */
export function userCollectFormResponseChipLabel(m: UIMessage): string | null {
  const part = m.parts.find(
    (p) => (p as { type?: string }).type === 'data-collect-form-response',
  ) as { data?: { values?: Record<string, unknown> } } | undefined
  if (!part) return null
  const vals = part.data?.values
  const n =
    vals && typeof vals === 'object' && !Array.isArray(vals)
      ? Object.keys(vals).length
      : 0
  return n > 0 ? `Form submitted (${n} fields)` : 'Form submitted'
}
