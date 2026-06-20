import { jsonrepair } from 'jsonrepair'
import { createLogger, traceFunction } from '@main/logger'
import type { SummaryResult } from '../types'

export type LooseSummaryOutput = {
  summary?: unknown
  goalAchieved?: unknown
  goal_achieved?: unknown
  waysToAchieveGoalBetter?: unknown
  ways_to_achieve_goal_better?: unknown
  doAgain?: unknown
  do_again?: unknown
  shouldMemorize?: unknown
  should_memorize?: unknown
  memorizeReason?: unknown
  memorize_reason?: unknown
}

const log = createLogger('agent.utils.summary-parse')

function extractTopLevelJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null

  for (let i = start; i < text.length; i++) {
    if (text[i] !== '}') continue
    const candidate = text.slice(start, i + 1)
    try {
      const repaired = jsonrepair(candidate)
      const parsed = JSON.parse(repaired)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return repaired
      }
    } catch {
      // keep scanning
    }
  }
  return null
}

function parseAsObject(value: unknown): LooseSummaryOutput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as LooseSummaryOutput
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (
      v === 'true' ||
      v === 'yes' ||
      v === 'achieved' ||
      v === 'complete' ||
      v === 'retry'
    ) {
      return true
    }
    if (
      v === 'false' ||
      v === 'no' ||
      v === 'not achieved' ||
      v === 'incomplete' ||
      v === 'skip'
    ) {
      return false
    }
  }
  return false
}

function readOptionalString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function normalizeSummaryOutput(raw: LooseSummaryOutput): SummaryResult {
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  const goalAchieved = normalizeBoolean(raw.goalAchieved ?? raw.goal_achieved)

  const legacyDoAgainText = readOptionalString(raw.doAgain, raw.do_again)
  const waysToAchieveGoalBetter = readOptionalString(
    raw.waysToAchieveGoalBetter,
    raw.ways_to_achieve_goal_better,
    legacyDoAgainText,
  )

  const shouldMemorize = normalizeBoolean(
    raw.shouldMemorize ?? raw.should_memorize,
  )
  const memorizeReason = readOptionalString(
    raw.memorizeReason,
    raw.memorize_reason,
  )

  return {
    summary,
    goalAchieved,
    waysToAchieveGoalBetter,
    shouldMemorize,
    memorizeReason: shouldMemorize ? memorizeReason : '',
  }
}

function parseSummaryJsonImpl(raw: string): SummaryResult {
  const candidates = new Set<string>()
  const trimmed = raw.trim()
  if (trimmed) candidates.add(trimmed)

  const fullFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fullFence?.[1]) candidates.add(fullFence[1].trim())

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi
  for (const match of trimmed.matchAll(fenceRegex)) {
    if (match[1]) candidates.add(match[1].trim())
  }

  for (const candidate of [...candidates]) {
    const extracted = extractTopLevelJsonObject(candidate)
    if (extracted) candidates.add(extracted.trim())
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(jsonrepair(candidate))
      const direct = parseAsObject(parsed)
      if (direct) return normalizeSummaryOutput(direct)

      if (typeof parsed === 'string') {
        const nested = parseAsObject(JSON.parse(jsonrepair(parsed)))
        if (nested) return normalizeSummaryOutput(nested)
      }
    } catch {
      // try next
    }
  }

  if (trimmed) {
    log.warn('Summary response was not JSON; treating as prose summary', {
      preview: trimmed.slice(0, 120),
    })
    return {
      summary: trimmed,
      goalAchieved: false,
      waysToAchieveGoalBetter: '',
      shouldMemorize: false,
      memorizeReason: '',
    }
  }

  throw new Error('Summary step response was empty.')
}

export const parseSummaryJson = traceFunction(
  log,
  'parseSummaryJson',
  parseSummaryJsonImpl,
)

export function formatSummaryMarkdown(result: SummaryResult): string {
  const achievedLabel = result.goalAchieved ? 'Yes' : 'No'
  const lines = [
    `- Summary: ${result.summary || '(none)'}`,
    '',
    `- Goal achieved: ${achievedLabel}`,
  ]
  if (result.waysToAchieveGoalBetter.trim()) {
    lines.push(
      '',
      '- What else can be done to achieve the goal better:',
      result.waysToAchieveGoalBetter.trim(),
    )
  }
  if (result.shouldMemorize && result.memorizeReason.trim()) {
    lines.push(
      '',
      '- Retain for future runs: Yes',
      '',
      result.memorizeReason.trim(),
    )
  }
  return lines.join('\n')
}

/** Text passed to report / structured assistant payloads. */
export function formatSummaryForContext(result: SummaryResult): string {
  return formatSummaryMarkdown(result)
}

export function summaryFromStepData(
  data: Pick<
    SummaryResult,
    | 'summary'
    | 'goalAchieved'
    | 'waysToAchieveGoalBetter'
    | 'shouldMemorize'
    | 'memorizeReason'
  > &
    Partial<{ rendered?: string }>,
): SummaryResult {
  const shouldMemorize = Boolean(data.shouldMemorize)
  return {
    summary: data.summary?.trim() ?? '',
    goalAchieved: Boolean(data.goalAchieved),
    waysToAchieveGoalBetter: data.waysToAchieveGoalBetter?.trim() ?? '',
    shouldMemorize,
    memorizeReason: shouldMemorize ? (data.memorizeReason?.trim() ?? '') : '',
  }
}

export function summaryDisplayText(
  data: Pick<
    SummaryResult,
    | 'summary'
    | 'goalAchieved'
    | 'waysToAchieveGoalBetter'
    | 'shouldMemorize'
    | 'memorizeReason'
  > &
    Partial<{ rendered?: string }>,
): string {
  const rendered = data.rendered?.trim()
  if (rendered) return rendered
  return formatSummaryMarkdown(summaryFromStepData(data))
}
