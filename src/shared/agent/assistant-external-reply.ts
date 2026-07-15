import {
  AGENTIC_RUN_STEP_TITLE,
  isAgenticRunParentStepTitle,
  isAgenticRunPerTaskStepTitle,
  LEGACY_TOOL_LOOP_STEP_TITLE,
} from './agentic-run-labels'

/** Section headers embedded in {@link finalResult} by buildStructuredAssistantContent. */
const STRUCTURED_FINAL_RESULT_SECTION_SEPARATOR = '\n\n---\n\n'

/** Entire section is internal-only — drop it, do not surface any body text. */
const SKIP_ENTIRELY_SECTION_HEADERS = [
  '**Thinking**',
  '**Goals & completed work**',
  '**Planning**',
] as const

/** Strip these headers but keep the section body when it is user-facing prose. */
const STRIP_INTERNAL_SECTION_HEADERS = [
  '**Skills & tool execution**',
  `**${AGENTIC_RUN_STEP_TITLE}**`,
  `**${LEGACY_TOOL_LOOP_STEP_TITLE}**`,
  '**Summary**',
  '**Report**',
  '**Research report**',
  '**Answer**',
  '**Final result**',
] as const

const EXCLUDED_WHOLE_SECTION_PATTERNS = [
  /^#\s*Artifact index\b/i,
  /^Artifact paths:/im,
  /^#\s*Step outputs\b/i,
] as const

const PIPELINE_SKIP_SECTION_IDS = new Set([
  'ThinkingStep',
  'thinking',
  'PlanningStep',
  'planning',
])

const PIPELINE_DELIVERABLE_SECTION_IDS = [
  'SummaryStep',
  'AnalysisStep',
  'ReportStep',
  'researchReport',
] as const

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionStartsWithHeader(body: string, header: string): boolean {
  return body.startsWith(header)
}

function stripBoldHeaderLine(text: string, header: string): string {
  const escaped = escapeRegExp(header)
  return text
    .replace(new RegExp(`^${escaped}\\s*\\n+`), '')
    .replace(new RegExp(`\\n\\n${escaped}\\s*\\n+`, 'g'), '\n\n')
    .trim()
}

function stripAgenticRunTaskHeaders(text: string): string {
  return text
    .replace(
      new RegExp(
        `^\\*\\*${escapeRegExp(AGENTIC_RUN_STEP_TITLE)} Task \\d+(?: Attempt \\d+)?\\*\\*\\s*\\n+`,
        'gm',
      ),
      '',
    )
    .replace(/^#{1,3}\s*Agentic Run(?: Task \d+)?(?: Attempt \d+)?\s*\n+/gim, '')
    .replace(/^#{1,3}\s*Tool Loop(?: Task \d+)?(?: Attempt \d+)?\s*\n+/gim, '')
    .trim()
}

function stripInternalPipelineHeaders(text: string): string {
  let result = text.trim()
  for (const header of STRIP_INTERNAL_SECTION_HEADERS) {
    result = stripBoldHeaderLine(result, header)
  }
  result = stripAgenticRunTaskHeaders(result)
  result = result
    .replace(/^#{1,3}\s*Summary\s*\n+/i, '')
    .replace(/^#{1,3}\s*Report\s*\n+/i, '')
    .replace(/^#{1,3}\s*Research report\s*\n+/i, '')
    .replace(/^#{1,3}\s*Final result\s*\n+/i, '')
    .trim()
  return result
}

function isToolExecutionDump(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (/^\w+\([^)]*\)\s*$/.test(trimmed)) return true
  if (
    /^(read_file|list_files|write_file|run_terminal|grep|glob|search|execute|bash|shell)\(/i.test(
      trimmed,
    )
  ) {
    return true
  }
  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return true
  return lines.every(
    (line) =>
      /^\w+\(/.test(line) ||
      line.startsWith('```') ||
      line === '```' ||
      /^Tool (call|result):/i.test(line),
  )
}

function shouldSkipEntireSection(body: string): boolean {
  if (
    SKIP_ENTIRELY_SECTION_HEADERS.some((header) =>
      sectionStartsWithHeader(body, header),
    )
  ) {
    return true
  }
  return EXCLUDED_WHOLE_SECTION_PATTERNS.some((pattern) => pattern.test(body))
}

export type PipelineConversationTurnLike = {
  sectionId?: string
  content?: string
}

export type AssistantExternalReplyOuter = {
  finalResult: string
  report: string
  researchReport?: { paperExcerpt?: string }
  pipelineConversation?: PipelineConversationTurnLike[]
}

/** Prefer a clean one-line failure over the raw Skills/Agentic dump. */
function extractExecutionErrorSummary(text: string): string | null {
  const match = text.match(
    /Execution error:\s*([^\n]+(?:\n(?!\s*\*\*)[^\n]+)*)/i,
  )
  if (!match?.[1]) return null
  const detail = match[1].replace(/\s+/g, ' ').trim()
  if (!detail) return null
  // Cap so the bubble stays readable when the provider message is long.
  const clipped =
    detail.length > 400 ? `${detail.slice(0, 397).trimEnd()}…` : detail
  return `Something went wrong while running tools.\n\n${clipped}`
}

/** Keep user-facing sections from aggregated finalResult; drop thinking/tools/planning. */
export function extractUserFacingTextFromFinalResult(finalResult: string): string {
  const trimmed = finalResult.trim()
  if (!trimmed) return ''

  const sections = trimmed.split(STRUCTURED_FINAL_RESULT_SECTION_SEPARATOR)
  const kept: string[] = []

  for (const section of sections) {
    const body = section.trim()
    if (!body) continue
    if (shouldSkipEntireSection(body)) continue

    const cleaned = stripInternalPipelineHeaders(body)
    if (!cleaned || isToolExecutionDump(cleaned)) continue
    kept.push(cleaned)
  }

  const joined = kept.join('\n\n\n').trim()
  if (joined) {
    const failure = extractExecutionErrorSummary(joined)
    // Agentic-run / skills dumps that only carry an execution failure → short summary.
    const looksLikeAgenticDump =
      /Agentic Run|Skills\s*&\s*tool execution|result\s*\(empty\)/i.test(joined)
    if (failure && looksLikeAgenticDump) {
      return failure
    }
    return joined
  }

  return extractExecutionErrorSummary(trimmed) ?? ''
}

export function userFacingTextFromPipelineConversation(
  turns: PipelineConversationTurnLike[] | undefined,
): string {
  if (!turns?.length) return ''

  for (const sectionId of PIPELINE_DELIVERABLE_SECTION_IDS) {
    const turn = [...turns]
      .reverse()
      .find((row) => row.sectionId === sectionId && row.content?.trim())
    if (turn?.content?.trim()) {
      const cleaned = stripInternalPipelineHeaders(turn.content)
      if (cleaned && !isToolExecutionDump(cleaned)) return cleaned
    }
  }

  for (const turn of [...turns].reverse()) {
    const sectionId = turn.sectionId?.trim() ?? ''
    if (PIPELINE_SKIP_SECTION_IDS.has(sectionId)) continue
    const cleaned = stripInternalPipelineHeaders(turn.content ?? '')
    if (!cleaned || isToolExecutionDump(cleaned)) continue
    return cleaned
  }

  return ''
}

/** Text safe to send on channels/schedulers: answer/report only, no tools or reasoning. */
export function userFacingTextFromStructuredOuter(
  outer: AssistantExternalReplyOuter,
): string {
  const report = outer.report.trim()
  if (report) return report

  const excerpt = outer.researchReport?.paperExcerpt?.trim()
  if (excerpt) return excerpt

  const fromFinalResult = extractUserFacingTextFromFinalResult(outer.finalResult)
  if (fromFinalResult) return fromFinalResult

  return userFacingTextFromPipelineConversation(outer.pipelineConversation)
}

/** Markdown body for sandbox final-result.html — no pipeline section titles. */
export function formatFinalResultHtmlBody(
  outer: AssistantExternalReplyOuter,
): string {
  return userFacingTextFromStructuredOuter(outer).trim()
}
