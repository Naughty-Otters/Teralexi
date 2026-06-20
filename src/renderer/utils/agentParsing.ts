// ── Agent parsing utilities ──────────────────────────────────────────────

import { jsonrepair } from 'jsonrepair'
import { ReferenceContext } from '@main/agent/resources'

export type LoosePlanningOutput = {
  finalGoal?: unknown
  todoList?: unknown
  expectations?: unknown
  /** @deprecated Legacy singular key */
  expectation?: unknown
  questions?: unknown
  reference_doc?: unknown
  reference_scripts?: unknown
}

/**
 * Extracts the first repairable top-level JSON object from a string.
 */
export function extractTopLevelJsonObject(text: string): string | null {
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
      // Keep scanning until we find a repairable object candidate.
    }
  }

  return null
}

function parseAsObject(value: unknown): LoosePlanningOutput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as LoosePlanningOutput
}

/**
 * Parses the raw LLM output of the planning step into a LoosePlanningOutput.
 * Handles markdown code fences and double-encoded JSON.
 * Throws if no valid JSON object can be extracted.
 */
export function parsePlanningJson(raw: string): LoosePlanningOutput {
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
      const directObject = parseAsObject(parsed)
      if (directObject) return directObject

      if (typeof parsed === 'string') {
        const reparsed = JSON.parse(jsonrepair(parsed))
        const nestedObject = parseAsObject(reparsed)
        if (nestedObject) return nestedObject
      }
    } catch {
      // Keep trying other normalized candidates.
    }
  }

  throw new Error('Planning output is not a valid JSON object')
}

export type NormalizedTodoItem = {
  name: string
  description: string
  success_criteria: string
  fallback_plan: string
  questions: string[]
  reference_doc: NormalizedReferenceDoc[]
  reference_scripts: NormalizedReferenceScript[]
}

export type NormalizedReferenceDoc = {
  reference_url: string
}

export type NormalizedReferenceScript = {
  script_type: 'python' | 'node' | 'bash'
  reference_url: string
}

/**
 * Normalises the loose planning output from the LLM into typed fields.
 */
export function normalizePlanningOutput(raw: LoosePlanningOutput): {
  finalGoal: string
  expectations: string[]
  questions: string[]
  todoItems: NormalizedTodoItem[]
  reference_doc: NormalizedReferenceDoc[]
  reference_scripts: NormalizedReferenceScript[]
} {
  const finalGoal =
    typeof raw.finalGoal === 'string' ? raw.finalGoal.trim() : ''

  const expectations = Array.isArray(raw.expectations ?? raw.expectation)
    ? (raw.expectations ?? raw.expectations)!
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim())
        .filter(Boolean)
    : []

  const todoItems: NormalizedTodoItem[] = []
  if (Array.isArray(raw.todoList)) {
    for (const item of raw.todoList) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      const description =
        typeof obj.description === 'string' ? obj.description.trim() : ''
      const success_criteria =
        typeof obj.success_criteria === 'string'
          ? obj.success_criteria.trim()
          : ''
      const fallback_plan =
        typeof obj.fallback_plan === 'string' ? obj.fallback_plan.trim() : ''
      const itemQuestions = Array.isArray(obj.questions)
        ? obj.questions
            .filter((q): q is string => typeof q === 'string')
            .map((q) => q.trim())
            .filter(Boolean)
        : []
      if (name || description) {
        const perDocs: NormalizedReferenceDoc[] = []
        if (Array.isArray(obj.reference_doc)) {
          for (const doc of obj.reference_doc) {
            if (!doc || typeof doc !== 'object') continue
            const d = doc as Record<string, unknown>
            const reference_url =
              (typeof d.reference_url === 'string'
                ? d.reference_url.trim()
                : '') ||
              (typeof d.path === 'string' ? d.path.trim() : '') ||
              (typeof d.name === 'string' ? d.name.trim() : '')
            if (reference_url) perDocs.push({ reference_url })
          }
        }
        const perScripts: NormalizedReferenceScript[] = []
        const scriptSource = obj.reference_scripts ?? obj.scripts
        if (Array.isArray(scriptSource)) {
          for (const script of scriptSource) {
            if (typeof script === 'string') {
              const reference_url = script.trim()
              if (reference_url) {
                perScripts.push({
                  script_type: 'bash',
                  reference_url,
                })
              }
              continue
            }
            if (!script || typeof script !== 'object') continue
            const s = script as Record<string, unknown>
            const rawType =
              typeof s.script_type === 'string' ? s.script_type.trim() : ''
            const script_type =
              ReferenceContext.normalizeReferenceScriptType(rawType)
            const reference_url =
              (typeof s.reference_url === 'string'
                ? s.reference_url.trim()
                : '') || (typeof s.path === 'string' ? s.path.trim() : '')
            if (reference_url) perScripts.push({ script_type, reference_url })
          }
        }
        todoItems.push({
          name,
          description,
          success_criteria,
          fallback_plan,
          questions: itemQuestions,
          reference_doc: perDocs,
          reference_scripts: perScripts,
        })
      }
    }
  }

  const reference_doc: NormalizedReferenceDoc[] = []
  if (Array.isArray(raw.reference_doc)) {
    for (const doc of raw.reference_doc) {
      if (!doc || typeof doc !== 'object') continue
      const obj = doc as Record<string, unknown>
      const reference_url =
        (typeof obj.reference_url === 'string'
          ? obj.reference_url.trim()
          : '') ||
        (typeof obj.path === 'string' ? obj.path.trim() : '') ||
        (typeof obj.name === 'string' ? obj.name.trim() : '')
      if (reference_url) reference_doc.push({ reference_url })
    }
  }

  const reference_scripts: NormalizedReferenceScript[] = []
  if (Array.isArray(raw.reference_scripts)) {
    for (const script of raw.reference_scripts) {
      if (!script || typeof script !== 'object') continue
      const obj = script as Record<string, unknown>
      const rawType =
        typeof obj.script_type === 'string' ? obj.script_type.trim() : ''
      const script_type = ReferenceContext.normalizeReferenceScriptType(rawType)
      const reference_url =
        (typeof obj.reference_url === 'string'
          ? obj.reference_url.trim()
          : '') || (typeof obj.path === 'string' ? obj.path.trim() : '')
      if (reference_url) reference_scripts.push({ script_type, reference_url })
    }
  }

  return {
    finalGoal,
    expectations,
    questions,
    todoItems,
    reference_doc,
    reference_scripts,
  }
}
