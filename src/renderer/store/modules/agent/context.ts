import { z } from 'zod'
import { userFacingTextFromStructuredOuter } from '@shared/agent/assistant-external-reply'
import type { AssistantStructuredContent } from './types'

function validateStepCaptures(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every((sc) => {
    if (!sc || typeof sc !== 'object') return false
    const o = sc as Record<string, unknown>
    return (
      typeof o.stepType === 'string' &&
      typeof o.title === 'string' &&
      typeof o.content === 'string' &&
      Array.isArray(o.outputPaths) &&
      o.outputPaths.every((p) => typeof p === 'string')
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

  if (outer.stepCaptures !== undefined && !validateStepCaptures(outer.stepCaptures))
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
    return null
  }
}

export function mergeStreamingTextIntoStructuredContent(
  raw: string,
  streamingText: string,
): string {
  const structured = parseAssistantStructuredContent(raw)
  if (!structured) return raw

  const normalizedStreamingText = streamingText.trim()
  if (!normalizedStreamingText) return raw

  structured.assistantContent.outer.streamingText = normalizedStreamingText
  return JSON.stringify(structured)
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

  // Keep history concise and user-facing. Fall back to step content when
  // outer sections are empty (e.g. clarification-only flows).
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

  const joined = lines.join('\n\n').trim()
  return joined || raw
}

export function serializeAssistantMessageForExternalReply(raw: string): string {
  const structured = parseAssistantStructuredContent(raw)
  if (!structured) return raw.trim()
  return userFacingTextFromStructuredOuter(structured.assistantContent.outer)
}
