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
  'lsp',
  'shell',
  'web_search',
  'web_scrape',
  'read_todos',
])

/** @deprecated Use {@link EXPLORE_MODE_ALLOWED_TOOLS} */
export const PLAN_MODE_ALLOWED_TOOLS = EXPLORE_MODE_ALLOWED_TOOLS

/**
 * Sub-agent profile ids.
 * Cursor built-ins: explore | bash | browser (priority for noisy work).
 * Orchestration: architect (plan) | coder.
 */
export type SubagentProfileType =
  | 'explore'
  | 'bash'
  | 'browser'
  | 'architect'
  | 'coder'

export const SUBAGENT_PROFILE_TYPES: readonly SubagentProfileType[] = [
  'explore',
  'bash',
  'browser',
  'architect',
  'coder',
] as const

/** Cursor-equivalent built-ins — prefer these when the workload matches. */
export const CURSOR_BUILTIN_SUBAGENT_PROFILES: readonly SubagentProfileType[] = [
  'explore',
  'bash',
  'browser',
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

export function isCursorBuiltinSubagentProfile(
  type: SubagentProfileType,
): boolean {
  return (CURSOR_BUILTIN_SUBAGENT_PROFILES as readonly string[]).includes(type)
}
