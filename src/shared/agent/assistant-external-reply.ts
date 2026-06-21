/** Section headers embedded in {@link finalResult} by buildStructuredAssistantContent. */
const STRUCTURED_FINAL_RESULT_SECTION_SEPARATOR = '\n\n---\n\n'

const EXCLUDED_EXTERNAL_REPLY_SECTION_HEADERS = [
  '**Thinking**',
  '**Goals & completed work**',
  '**Planning**',
  '**Skills & tool execution**',
] as const

export type AssistantExternalReplyOuter = {
  finalResult: string
  report: string
  researchReport?: { paperExcerpt?: string }
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
    const excluded = EXCLUDED_EXTERNAL_REPLY_SECTION_HEADERS.some((header) =>
      body.startsWith(header),
    )
    if (excluded) continue
    kept.push(body)
  }

  return kept.join(STRUCTURED_FINAL_RESULT_SECTION_SEPARATOR).trim()
}

/** Text safe to send on channels/schedulers: answer/report only, no tools or reasoning. */
export function userFacingTextFromStructuredOuter(
  outer: AssistantExternalReplyOuter,
): string {
  const report = outer.report.trim()
  if (report) return report

  const excerpt = outer.researchReport?.paperExcerpt?.trim()
  if (excerpt) return excerpt

  return extractUserFacingTextFromFinalResult(outer.finalResult)
}
