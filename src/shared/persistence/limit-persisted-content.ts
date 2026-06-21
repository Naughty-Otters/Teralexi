import { HEAD_TAIL_KEEP_CHARS } from '@shared/text/truncate-head-tail'
import { prepareAndTruncateMarkdownSource } from '@shared/markdown/prepare-markdown-source'

/** Hard cap on a full assistant message row (structured JSON string). */
export const PERSISTED_MESSAGE_CONTENT_MAX_CHARS = 1200_000

type StructuredPersistShape = {
  version?: unknown
  assistantContent?: {
    outer?: Record<string, unknown>
    subSteps?: Array<Record<string, unknown>>
  }
}

function limitTextForStorage(
  text: string,
  keepChars: number = HEAD_TAIL_KEEP_CHARS,
): string {
  return prepareAndTruncateMarkdownSource(text, keepChars)
}

function limitStructuredShape(
  parsed: StructuredPersistShape,
  keepChars: number = HEAD_TAIL_KEEP_CHARS,
): StructuredPersistShape {
  const outer = { ...(parsed.assistantContent?.outer ?? {}) }

  delete outer.streamingText

  if (typeof outer.finalResult === 'string') {
    outer.finalResult = limitTextForStorage(outer.finalResult, keepChars)
  }
  if (typeof outer.report === 'string') {
    outer.report = limitTextForStorage(outer.report, keepChars)
  }

  const pipeline = outer.pipelineConversation
  if (Array.isArray(pipeline)) {
    outer.pipelineConversation = pipeline.map((turn) => {
      if (!turn || typeof turn !== 'object') return turn
      const row = { ...(turn as Record<string, unknown>) }
      if (typeof row.content === 'string') {
        row.content = limitTextForStorage(row.content, keepChars)
      }
      return row
    })
  }

  const captures = outer.stepCaptures
  if (Array.isArray(captures)) {
    outer.stepCaptures = captures.map((capture) => {
      if (!capture || typeof capture !== 'object') return capture
      const row = { ...(capture as Record<string, unknown>) }
      if (typeof row.content === 'string') {
        row.content = limitTextForStorage(row.content, keepChars)
      }
      return row
    })
  }

  const subSteps = (parsed.assistantContent?.subSteps ?? []).map((step) => {
    const row = { ...step }
    if (typeof row.content === 'string') {
      row.content = limitTextForStorage(row.content, keepChars)
    }
    return row
  })

  return {
    ...parsed,
    assistantContent: {
      ...parsed.assistantContent,
      outer,
      subSteps,
    },
  }
}

function isStructuredPersistShape(value: unknown): value is StructuredPersistShape {
  if (!value || typeof value !== 'object') return false
  const root = value as StructuredPersistShape
  return root.version === 2 && typeof root.assistantContent === 'object'
}

function shrinkStructuredByReducingFields(
  parsed: StructuredPersistShape,
): string {
  let keep = HEAD_TAIL_KEEP_CHARS

  while (keep >= 1000) {
    const limited = limitStructuredShape(parsed, keep)
    const json = JSON.stringify(limited)
    if (json.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return json
    keep = Math.floor(keep / 2)
  }

  const outer = parsed.assistantContent?.outer ?? {}
  const minimal: StructuredPersistShape = {
    version: 2,
    assistantContent: {
      outer: {
        finalResult:
          typeof outer.finalResult === 'string'
            ? limitTextForStorage(outer.finalResult, 1000)
            : '',
        report: '',
        pipelineConversation: [],
      },
      subSteps: [],
    },
  }
  return JSON.stringify(minimal)
}

function shrinkStructuredToFit(json: string, parsed: StructuredPersistShape): string {
  if (json.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return json

  const outer = parsed.assistantContent?.outer
  const pipeline = outer?.pipelineConversation
  if (Array.isArray(pipeline) && pipeline.length > 0) {
    let turns = [...pipeline]
    while (turns.length > 0) {
      turns.pop()
      const working = limitStructuredShape({
        ...parsed,
        assistantContent: {
          ...parsed.assistantContent,
          outer: {
            ...parsed.assistantContent?.outer,
            pipelineConversation: [...turns],
          },
        },
      })
      const next = JSON.stringify(working)
      if (next.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return next
    }
  }

  return shrinkStructuredByReducingFields(parsed)
}

/** Step progress / pipeline turn bodies. */
export function limitPersistedStepText(text: string): string {
  return limitTextForStorage(text)
}

/** Report and aggregated final-result fields. */
export function limitPersistedReportText(text: string): string {
  return limitTextForStorage(text)
}

/**
 * Cap message bodies before SQLite write. Structured assistant JSON is trimmed
 * field-by-field; ephemeral streaming fields are dropped.
 *
 * Server-side storage only — UI bubble layout must not influence this layer.
 * @see conversation-storage-contract.ts
 */
export function limitMessageContentForPersistence(
  content: string,
  role: 'user' | 'assistant',
): string {
  const trimmed = content.trim()
  if (!trimmed) return content

  if (role === 'user') {
    return limitTextForStorage(trimmed)
  }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isStructuredPersistShape(parsed)) {
      return limitTextForStorage(trimmed)
    }
    const limited = limitStructuredShape(parsed)
    const json = JSON.stringify(limited)
    return shrinkStructuredToFit(json, limited)
  } catch {
    return limitTextForStorage(trimmed)
  }
}
