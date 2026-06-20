/**
 * HITL forms collect **user-facing** inputs only (choices, paths, content the user owns).
 * Planner todo text often mentions verification, success criteria, and execution steps —
 * those must not become form fields.
 */

export type FormFieldKeyLabel = { key: string; label: string }

/** Substrings in field keys that indicate agent/planner metadata, not user input. */
const SYSTEM_FIELD_KEY_MARKERS = [
  'success_criteria',
  'successcriteria',
  'verification',
  'verify_',
  'how_to_verify',
  'validate_',
  'execution_mode',
  'execution_decision',
  'execution_plan',
  'fallback_plan',
  'fallbackplan',
  'manual_intervention',
  'retry_',
  'planning_',
  'agent_',
  'pipeline_',
  'step_goal',
  'rubric',
  'acceptance_criteria',
  'reference_doc',
  'reference_script',
  'sandbox_',
  'tool_loop',
  'hitl_',
  'present_form',
  'collect_via',
  'readiness',
  'infer_',
  'context_gather',
  'executor_',
  'verifier_',
] as const

/** Label phrases that describe how the agent runs, not what the user wants. */
const SYSTEM_FIELD_LABEL_PATTERNS: RegExp[] = [
  /\bsuccess\s*criteria\b/i,
  /\bhow\s+to\s+verify\b/i,
  /\bverification\s*(method|approach|step)?\b/i,
  /\bvalidate\s+(the\s+)?(step|task|output|result)\b/i,
  /\bexecution\s*(mode|decision|plan|strategy|approach)\b/i,
  /\bfallback\s*plan\b/i,
  /\bmanual\s*intervention\b/i,
  /\bagent\s*(pipeline|step|run)\b/i,
  /\bconfirm\s*(execution|proceeding|before\s+run)\b/i,
  /\binternal\s*(context|state|decision)\b/i,
  /\bplanner\b/i,
  /\btodo\s*status\b/i,
  /\bstep\s*goal\b/i,
  /\brubric\b/i,
  /\bacceptance\s*criteria\b/i,
]

function normalizedKey(key: string): string {
  return key.trim().toLowerCase().replace(/-/g, '_')
}

function normalizedLabel(label: string): string {
  return label.trim().toLowerCase()
}

/**
 * True when this field should be shown to the user in a collect-form UI.
 * False for verification, execution, and planner metadata.
 */
export function isUserFacingFormField(field: FormFieldKeyLabel): boolean {
  const key = normalizedKey(field.key)
  const label = normalizedLabel(field.label)
  if (!key || !label) return false

  for (const marker of SYSTEM_FIELD_KEY_MARKERS) {
    if (key === marker || key.includes(marker)) return false
  }

  if (key === 'context' || key === 'execution' || key === 'verify') {
    return false
  }

  for (const pattern of SYSTEM_FIELD_LABEL_PATTERNS) {
    if (pattern.test(label)) return false
  }

  if (/^verify\b/i.test(label) && !/\bemail\b/i.test(label)) {
    return false
  }

  return true
}

/** Drop system/execution fields; preserve order of user-facing fields. */
export function filterToUserFacingFormFields<T extends FormFieldKeyLabel>(
  fields: T[],
): T[] {
  return fields.filter((f) => isUserFacingFormField(f))
}
