import {
  type CodingMode,
  DEFAULT_CODING_MODE,
  EXPLORE_MODE_ALLOWED_TOOLS,
  parseCodingMode,
} from '@shared/agent/coding-mode'
import { skillIsCodingAgent } from '@shared/agent/coding-agent'
import { getConversationStore } from '@main/services/conversation-store'
import { PLAN_MODE_ALLOWED_TOOL_NAMES } from './plan-mode-active-tools'
import { isPlanModeActive } from './plan-mode-state'
import {
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  wrapPlanModeFileToolExecutes,
  wrapPlanModeTodoToolExecutes,
} from '@toolSet/planning'

type ToolSpec = { needsApproval?: unknown; execute?: (input: unknown) => Promise<unknown> }

const PLAN_MODE_EXTRA_TOOLS = new Set([
  'edit_files',
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
])

/**
 * Resolve coding mode for a conversation (defaults to normal).
 */
export function getCodingModeForConversation(
  conversationId: string | undefined,
): CodingMode {
  const id = conversationId?.trim()
  if (!id) return DEFAULT_CODING_MODE
  try {
    const store = getConversationStore()
    const settings =
      typeof store.getConversationSettings === 'function'
        ? store.getConversationSettings(id)
        : null
    return parseCodingMode(settings?.codingMode)
  } catch {
    return DEFAULT_CODING_MODE
  }
}

function applyPlanModeToolFilter(
  toolSet: Record<string, ToolSpec>,
  conversationId: string | undefined,
  codingMode: CodingMode,
): void {
  for (const name of Object.keys(toolSet)) {
    if (PLAN_MODE_ALLOWED_TOOL_NAMES.has(name)) continue
    delete toolSet[name]
  }

  if (toolSet[EXIT_PLAN_MODE_TOOL_NAME]) {
    toolSet[EXIT_PLAN_MODE_TOOL_NAME].needsApproval = true
  }

  if (codingMode === 'yolo' && toolSet[ENTER_PLAN_MODE_TOOL_NAME]) {
    toolSet[ENTER_PLAN_MODE_TOOL_NAME].needsApproval = false
  }

  if (codingMode === 'yolo' || codingMode === 'auto') {
    for (const [name, spec] of Object.entries(toolSet)) {
      if (name === EXIT_PLAN_MODE_TOOL_NAME) continue
      spec.needsApproval = false
    }
  }

  const wrapped = toolSet as Record<string, { execute?: (input: unknown) => Promise<unknown> }>
  wrapPlanModeFileToolExecutes(wrapped, conversationId)
  wrapPlanModeTodoToolExecutes(wrapped, conversationId)
}

/**
 * Apply Kimi-like coding policy to a built AI SDK tool map.
 * - explore mode (agent): read-only + plan file writes
 * - explore: drop mutating tools
 * - yolo / auto: skip approvals (except exit_plan_mode)
 */
export function applyCodingAgentPolicy(
  toolSet: Record<string, ToolSpec>,
  conversationId: string | undefined,
  skillId?: string | null,
  runDepth?: number,
): void {
  if (typeof runDepth === 'number' && runDepth > 0) {
    return
  }

  const mode = getCodingModeForConversation(conversationId)
  const isCoding = skillIsCodingAgent(skillId)

  if (mode === 'yolo') {
    for (const spec of Object.values(toolSet)) {
      spec.needsApproval = false
    }
  }

  if (isPlanModeActive(conversationId)) {
    applyPlanModeToolFilter(toolSet, conversationId, mode)
    return
  }

  if (!isCoding) return

  if (mode === 'explore') {
    for (const name of Object.keys(toolSet)) {
      if (!EXPLORE_MODE_ALLOWED_TOOLS.has(name)) {
        delete toolSet[name]
      }
    }
    return
  }

  if (mode === 'auto') {
    for (const spec of Object.values(toolSet)) {
      spec.needsApproval = false
    }
  }
}

/**
 * System prompt addendum for auto mode (agent should not ask clarifying questions).
 */
export function codingModeSystemAddendum(mode: CodingMode): string {
  if (mode === 'normal') {
    return (
      '\n\n**Normal mode:** Large or multi-step tasks may automatically enter read-only explore mode ' +
      'so you can explore, write a plan, and get approval before making changes.'
    )
  }
  if (mode === 'auto') {
    return (
      '\n\n**Auto mode:** Do not ask the user clarifying questions. Make reasonable assumptions, ' +
      'execute tools, and report results.'
    )
  }
  if (mode === 'explore') {
    return (
      '\n\n**Explore mode:** You may only use read-only tools until the user allows writes. ' +
      'Map the codebase and produce a clear action plan (steps, files, risks) before requesting edit access.'
    )
  }
  if (mode === 'yolo') {
    return '\n\n**YOLO mode:** Tools run without per-call approval. Work carefully in the user workspace.'
  }
  return ''
}
