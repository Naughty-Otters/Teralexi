import { jsonrepair } from 'jsonrepair'
import { createLogger, traceFunction } from '@main/logger'
import type { ThinkingExecutionMode } from '../types'

export type { ThinkingExecutionMode }

export type LooseThinkingOutput = {
  execution_mode?: unknown
  goal?: unknown
  task?: unknown
  context?: unknown
  rationale?: unknown
  response?: unknown
}

export type NormalizedThinkingOutput = {
  execution_mode: ThinkingExecutionMode
  goal: string
  task: string
  context: string[]
  rationale?: string
  response?: string
}

const log = createLogger('agent.utils.thinking-parse')

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

function parseAsObject(value: unknown): LooseThinkingOutput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as LooseThinkingOutput
}

function normalizeExecutionMode(value: unknown): ThinkingExecutionMode {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (mode === 'direct_answer' || mode === 'directanswer' || mode === 'direct-answer') {
    return 'direct_answer'
  }
  if (mode === 'planning') return 'planning'
  if (mode === 'research') return 'research'
  if (mode === 'skill_chain' || mode === 'skillchain' || mode === 'skill-chain') {
    return 'skill_chain'
  }
  if (mode === 'agent_call' || mode === 'agentcall' || mode === 'agent') {
    return 'agent_call'
  }
  return 'agent_call'
}

function normalizeContext(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 5)
}

function normalizeThinkingOutputImpl(
  raw: LooseThinkingOutput,
): NormalizedThinkingOutput {
  const goal = typeof raw.goal === 'string' ? raw.goal.trim() : ''
  const task = typeof raw.task === 'string' ? raw.task.trim() : ''
  const rationale =
    typeof raw.rationale === 'string' ? raw.rationale.trim() : undefined
  const response =
    typeof raw.response === 'string' ? raw.response.trim() : undefined
  let execution_mode = normalizeExecutionMode(raw.execution_mode)
  if (execution_mode === 'direct_answer' && !response) {
    execution_mode = 'agent_call'
  }
  return {
    execution_mode,
    goal,
    task,
    context: normalizeContext(raw.context),
    ...(rationale ? { rationale } : {}),
    ...(response ? { response } : {}),
  }
}

export const normalizeThinkingOutput = traceFunction(
  log,
  'normalizeThinkingOutput',
  normalizeThinkingOutputImpl,
)

function parseThinkingJsonImpl(raw: string): NormalizedThinkingOutput {
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
      if (direct) return normalizeThinkingOutputImpl(direct)

      if (typeof parsed === 'string') {
        const nested = parseAsObject(JSON.parse(jsonrepair(parsed)))
        if (nested) return normalizeThinkingOutputImpl(nested)
      }
    } catch {
      // try next candidate
    }
  }

  log.warn('Failed to parse thinking JSON', { preview: trimmed.slice(0, 200) })
  throw new Error('Thinking step response was not valid JSON.')
}

export const parseThinkingJson = traceFunction(
  log,
  'parseThinkingJson',
  parseThinkingJsonImpl,
)

export function formatThinkingMarkdown(
  thinking: NormalizedThinkingOutput,
): string {
  const modeLabel =
    thinking.execution_mode === 'direct_answer'
      ? 'Direct answer'
      : thinking.execution_mode === 'agent_call'
        ? 'Agent call'
        : thinking.execution_mode === 'research'
          ? 'Research'
          : thinking.execution_mode === 'skill_chain'
            ? 'Skill chain'
            : 'Planning'
  const lines = [
    `- Mode: ${modeLabel}`,
    '',
    `- Goal: ${thinking.goal || '(none)'}`,
    '',
    `- Task: ${thinking.task || '(none)'}`,
  ]
  if (thinking.context.length > 0) {
    lines.push('', '- Context', ...thinking.context.map((c) => `- ${c}`))
  }
  if (thinking.rationale?.trim()) {
    lines.push('', `- Rationale: ${thinking.rationale.trim()}`)
  }
  return lines.join('\n')
}

export function formatThinkingDigestForPlanning(
  thinking: NormalizedThinkingOutput,
): string {
  const lines = [
    `execution_mode: ${thinking.execution_mode}`,
    `goal: ${thinking.goal}`,
    `task: ${thinking.task}`,
  ]
  if (thinking.context.length > 0) {
    lines.push('context:', ...thinking.context.map((c) => `- ${c}`))
  }
  if (thinking.rationale?.trim()) {
    lines.push(`rationale: ${thinking.rationale.trim()}`)
  }
  return lines.join('\n')
}
