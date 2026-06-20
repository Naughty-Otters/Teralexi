import { jsonrepair } from 'jsonrepair'
import { createLogger, traceFunction } from '@main/logger'
import { ReferenceContext } from '../resources/context'
import { ReferenceScript } from '../resources/reference-resource'
import type { TodoItem } from '../types'
import { pickTodoPlanningFields, sanitizePlanningField } from './planning-fields'

export type LoosePlanningOutput = {
  finalGoal?: unknown
  todoList?: unknown
  /** Overall run success checks; summary uses these to judge goalAchieved. */
  expectations?: unknown
  reference_doc?: unknown
  reference_scripts?: unknown
}

function parsePlanningStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => sanitizePlanningField(item))
    .filter(Boolean)
}

const log = createLogger('agent.utils.agent-parsing')

function extractTopLevelJsonObjectImpl(text: string): string | null {
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

export type NormalizedTodoItem = {
  name: string
  description: string
  success_criteria: string
  fallback_plan: 'retry' | 'skip' | 'manual_intervention'
  form_doc_name?: string
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

function parseReferenceDocArray(value: unknown): NormalizedReferenceDoc[] {
  if (!Array.isArray(value)) return []
  const out: NormalizedReferenceDoc[] = []
  for (const doc of value) {
    if (!doc || typeof doc !== 'object') continue
    const obj = doc as Record<string, unknown>
    const reference_url =
      (typeof obj.reference_url === 'string'
        ? obj.reference_url.trim()
        : '') ||
      (typeof obj.path === 'string' ? obj.path.trim() : '') ||
      (typeof obj.name === 'string' ? obj.name.trim() : '')
    if (reference_url) out.push({ reference_url })
  }
  return out
}

function scriptTypeFromPath(path: string): NormalizedReferenceScript['script_type'] {
  const lower = path.toLowerCase()
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.mjs') || lower.endsWith('.js')) return 'node'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'bash'
  return 'bash'
}

function parseReferenceScriptArray(
  value: unknown,
): NormalizedReferenceScript[] {
  if (!Array.isArray(value)) return []
  const out: NormalizedReferenceScript[] = []
  for (const script of value) {
    if (typeof script === 'string') {
      const reference_url = script.trim()
      if (reference_url) {
        out.push({
          script_type: scriptTypeFromPath(reference_url),
          reference_url,
        })
      }
      continue
    }
    if (!script || typeof script !== 'object') continue
    const obj = script as Record<string, unknown>
    const rawType =
      typeof obj.script_type === 'string' ? obj.script_type.trim() : ''
    const script_type = ReferenceContext.normalizeReferenceScriptType(rawType)
    const reference_url =
      (typeof obj.reference_url === 'string'
        ? obj.reference_url.trim()
        : '') ||
      (typeof obj.path === 'string' ? obj.path.trim() : '')
    if (reference_url) out.push({ script_type, reference_url })
  }
  return out
}

/** Infer sandbox script paths mentioned in planning text (e.g. `scripts/sort_script.py`). */
export function inferReferenceScriptsFromText(
  text: string,
): NormalizedReferenceScript[] {
  const out: NormalizedReferenceScript[] = []
  const seen = new Set<string>()
  const patterns = [
    /\b(?:scripts|bin)\/[\w./-]+\.(?:py|sh|bash|mjs|js)\b/gi,
    /\b[\w.-]+\.(?:py|sh|bash|mjs|js)\b/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      let reference_url = match[0].trim().replace(/^['"`]+|['"`]+$/g, '')
      if (!reference_url) continue
      if (!reference_url.includes('/')) {
        reference_url = `scripts/${reference_url}`
      }
      const key = reference_url.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        script_type: scriptTypeFromPath(reference_url),
        reference_url,
      })
    }
  }
  return out
}

function normalizePlanningOutputImpl(raw: LoosePlanningOutput): {
  finalGoal: string
  expectations: string[]
  todoItems: NormalizedTodoItem[]
} {
  const finalGoal =
    typeof raw.finalGoal === 'string'
      ? sanitizePlanningField(raw.finalGoal)
      : ''

  const expectations = parsePlanningStringArray(
    raw.expectations ??
      (raw as { expectation?: unknown }).expectation,
  )

  const globalDocs = parseReferenceDocArray(raw.reference_doc)
  const globalScripts = parseReferenceScriptArray(raw.reference_scripts)

  const todoItems: NormalizedTodoItem[] = []
  const rawTodoList = Array.isArray(raw.todoList)
    ? raw.todoList
    : Array.isArray((raw as { todoItems?: unknown }).todoItems)
      ? (raw as { todoItems: unknown[] }).todoItems
      : null
  if (rawTodoList) {
    for (const item of rawTodoList) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      let { name, description, success_criteria } = pickTodoPlanningFields(obj)
      if (!name && !description) {
        if (finalGoal) {
          name = `Step ${todoItems.length + 1}`
          description = finalGoal
        } else {
          continue
        }
      } else if (!name) {
        name = `Step ${todoItems.length + 1}`
      }
      const fallback_plan: 'retry' | 'skip' | 'manual_intervention' =
        typeof obj.fallback_plan === 'string' &&
        ['retry', 'skip', 'manual_intervention'].includes(obj.fallback_plan)
          ? (obj.fallback_plan.trim() as
              | 'retry'
              | 'skip'
              | 'manual_intervention')
          : 'retry'

      if (name || description) {
        const form_doc_name =
          typeof obj.form_doc_name === 'string' ? obj.form_doc_name.trim() : ''
        const perDocs = parseReferenceDocArray(obj.reference_doc)
        const perScripts = parseReferenceScriptArray(
          obj.reference_scripts ?? obj.scripts,
        )
        const reference_doc = perDocs.length > 0 ? perDocs : [...globalDocs]
        let reference_scripts =
          perScripts.length > 0 ? perScripts : [...globalScripts]
        if (reference_scripts.length === 0) {
          reference_scripts = inferReferenceScriptsFromText(
            [name, description, success_criteria].join('\n'),
          )
        }
        todoItems.push({
          name,
          description,
          success_criteria,
          fallback_plan,
          reference_doc,
          reference_scripts,
          ...(form_doc_name ? { form_doc_name } : {}),
        })
      }
    }
  }

  return {
    finalGoal,
    expectations,
    todoItems,
  }
}

/** Bullet list for pipeline context / UI from planning expectations. */
export function formatPlanningExpectations(expectations: string[]): string {
  if (expectations.length === 0) return ''
  return expectations.map((line, index) => `${index + 1}. ${line}`).join('\n')
}

/** Attach inferred `reference_scripts` when planning JSON omitted them but text cites a script path. */
export function enrichTodoItemsWithInferredScripts(todos: TodoItem[]): void {
  for (const t of todos) {
    if ((t.reference_scripts?.length ?? 0) > 0) continue
    const inferred = inferReferenceScriptsFromText(
      [t.name, t.description, t.success_criteria].join('\n'),
    )
    if (inferred.length === 0) continue
    t.reference_scripts = inferred.map(
      (s) => new ReferenceScript(s.script_type, s.reference_url),
    )
  }
}

export const normalizePlanningOutput = traceFunction(
  log,
  'normalizePlanningOutput',
  normalizePlanningOutputImpl,
)
