import type { AssistantStructuredContent } from '../types'
import { userFacingTextFromStructuredOuter } from '@shared/agent/assistant-external-reply'

const EMBEDDED_STRUCTURED_MARKER =
  /<!--\s*teralexi-structured:([A-Za-z0-9+/=]+)\s*-->/i

function parseEmbeddedStructuredContent(
  raw: string,
): AssistantStructuredContent | null {
  const marker = raw.match(EMBEDDED_STRUCTURED_MARKER)
  const encoded = marker?.[1]?.trim()
  if (!encoded) return null

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    return isAssistantStructuredContent(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validateStepAttachment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return typeof o.path === 'string' && typeof o.label === 'string'
}

function validateStepCaptures(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every((sc) => {
    if (!sc || typeof sc !== 'object') return false
    const o = sc as Record<string, unknown>
    const attachmentsOk =
      o.attachments === undefined ||
      (Array.isArray(o.attachments) &&
        o.attachments.every(validateStepAttachment))
    return (
      typeof o.stepType === 'string' &&
      typeof o.title === 'string' &&
      typeof o.content === 'string' &&
      Array.isArray(o.outputPaths) &&
      o.outputPaths.every((p) => typeof p === 'string') &&
      attachmentsOk
    )
  })
}

export function isAssistantStructuredContent(
  value: unknown,
): value is AssistantStructuredContent {
  if (!value || typeof value !== 'object') return false
  const root = value as Record<string, unknown>
  if (root.version !== 2) return false

  const assistantContent = root.assistantContent as
    | Record<string, unknown>
    | undefined
  if (!assistantContent || typeof assistantContent !== 'object') return false

  const outer = assistantContent.outer as Record<string, unknown> | undefined
  const subSteps = assistantContent.subSteps

  if (!outer || typeof outer !== 'object') return false
  if (!Array.isArray(subSteps)) return false

  if (
    outer.stepCaptures !== undefined &&
    !validateStepCaptures(outer.stepCaptures)
  )
    return false
  if (
    outer.allArtifactPaths !== undefined &&
    (!Array.isArray(outer.allArtifactPaths) ||
      !outer.allArtifactPaths.every((p) => typeof p === 'string'))
  )
    return false

  return (
    typeof outer.finalResult === 'string' &&
    typeof outer.report === 'string' &&
    subSteps.every((step) => {
      if (!step || typeof step !== 'object') return false
      const current = step as Record<string, unknown>
      return (
        typeof current.type === 'string' &&
        typeof current.title === 'string' &&
        typeof current.content === 'string'
      )
    })
  )
}

export function parseAssistantStructuredContent(
  raw: string,
): AssistantStructuredContent | null {
  try {
    const parsed = JSON.parse(raw)
    return isAssistantStructuredContent(parsed) ? parsed : null
  } catch {
    return parseEmbeddedStructuredContent(raw)
  }
}

export function serializeAssistantMessageForHistory(raw: string): string {
  const structured = parseAssistantStructuredContent(raw)
  if (!structured) return raw

  const outer = structured.assistantContent.outer
  const finalResult = outer.finalResult.trim()
  const report = outer.report.trim()

  const lines: string[] = []
  if (finalResult) lines.push(finalResult)
  if (report) lines.push(report)

  if (lines.length === 0) {
    const captures = outer.stepCaptures
    if (captures?.length) {
      for (const c of captures) {
        const body = c.content.trim()
        if (body) lines.push(`${c.title}\n\n${body}`)
      }
    }
    if (lines.length === 0) {
      for (const step of structured.assistantContent.subSteps) {
        const content = step.content.trim()
        if (content) lines.push(content)
      }
    }
  }

  // Empty structured shells (artifact paths only, no user-facing text) must not
  // fall back to raw JSON — that poisons history and can stall later turns.
  return lines.join('\n\n').trim()
}

/** Outbound channel/scheduler reply: user-facing text only (no tools, reasoning, or step dumps). */
export function serializeAssistantMessageForExternalReply(raw: string): string {
  const structured = parseAssistantStructuredContent(raw)
  if (!structured) return raw.trim()
  return userFacingTextFromStructuredOuter(structured.assistantContent.outer)
}
