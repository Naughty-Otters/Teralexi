/** Per-conversation coding agent interaction mode (Kimi-like). */
export type CodingMode = 'normal' | 'explore' | 'yolo' | 'auto'

export const CODING_MODES: readonly CodingMode[] = [
  'normal',
  'explore',
  'yolo',
  'auto',
] as const

export const DEFAULT_CODING_MODE: CodingMode = 'normal'

/** Legacy stored value before rename (plan mode → explore mode). */
export const LEGACY_CODING_MODE_PLAN = 'plan' as const

export function parseCodingMode(raw: unknown): CodingMode {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === LEGACY_CODING_MODE_PLAN) return 'explore'
  if ((CODING_MODES as readonly string[]).includes(v)) return v as CodingMode
  return DEFAULT_CODING_MODE
}

export function codingModeLabel(mode: CodingMode): string {
  switch (mode) {
    case 'explore':
      return 'Exploring'
    case 'yolo':
      return 'YOLO'
    case 'auto':
      return 'Auto'
    default:
      return 'Normal'
  }
}

/** Tools allowed while in explore mode (read-only until user allows writes). */
export const EXPLORE_MODE_ALLOWED_TOOLS = new Set([
  'read_file',
  'grep_files',
  'glob_files',
  'list_files',
  'search_files',
  'file_status',
  'lsp',
  'git_status',
  'git_diff',
  'git_log',
  'read_todos',
  'read_spreadsheet',
  'run_script',
  'run_script_file',
  'delegate_subagent',
  'dispatch_subagent',
])

/** @deprecated Use {@link EXPLORE_MODE_ALLOWED_TOOLS} */
export const PLAN_MODE_ALLOWED_TOOLS = EXPLORE_MODE_ALLOWED_TOOLS

export type SubagentProfileType = 'explore' | 'architect' | 'coder'

export const SUBAGENT_PROFILE_TYPES: readonly SubagentProfileType[] = [
  'explore',
  'architect',
  'coder',
] as const

/** Normalize subagent type; accepts legacy `plan` → `architect`. */
export function parseSubagentProfileType(raw: string): SubagentProfileType | null {
  const v = raw.trim().toLowerCase()
  if (v === 'plan') return 'architect'
  if ((SUBAGENT_PROFILE_TYPES as readonly string[]).includes(v)) {
    return v as SubagentProfileType
  }
  return null
}
