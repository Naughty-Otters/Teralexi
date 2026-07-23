import { existsSync } from 'node:fs'
import type { ModelMessage } from 'ai'
import { getCodingModeForConversation } from './coding-agent-policy'
import { wrapSystemReminder } from '../injection/injector'
import {
  consumePendingPlanActivation,
  consumePendingPlanExecution,
  getPlanModeStateForConversation,
  hasPendingPlanActivation,
  hasPendingPlanExecution,
  isPlanFileWritten,
  resolvePlanModeStorage,
} from './plan-mode-state'
import {
  consumeExecuteContinuationReminder,
  hasExecuteContinuationReminder,
} from './plan-mode-session-reminders'
import { readPlanModeTodoList } from './plan-mode-storage-impl'

export const PLAN_MODE_USER_TRIGGERS = {
  enter: '- enter explore mode, start planning.\n- update todos with plan steps \n- exit the plan after user approval',
  reenter: '- reenter explore mode, update todos with plan steps \n- exit the plan after user approval, and execute the plan',
  /** Post-approval execution phase (explore mode is already off). */
  execute: 'execute approved plan',
  /** Same-turn continuation when plans/todos.json still has unfinished steps. */
  executeContinuation: 'continue approved plan execution',
  continue: 'continue explore mode',
  yolo: 'yolo mode',
} as const

const PLAN_READY_EXIT_REMINDER =
  '**REQUIRED NEXT STEP:** Plan tasks are saved. Call `exit_plan_mode` now for user approval — do not end your turn with text only.'

const SPARSE_REMINDER =
  'Explore mode is active. Continue read-only research, keep the plan file and update_todos list in sync, ' +
  'then call exit_plan_mode when the plan is ready for approval. ' +
  'During explore, build an inventory of files and remote resources (URLs, web_search, web_scrape); on exit, the engine saves `plans/manifest.json` for execution todos — do not re-scan the repo or re-fetch the same URLs during execution.'

const PLAN_MODE_PERSISTENCE_RULE =
  '**CRITICAL:** Call `update_todos` with the full step list — that writes `plans/todos.json` and renders `plans/<slug>.md` from the Jinja plan template. ' +
  'A plan only in chat/reasoning does NOT count.'

const PLAN_MODE_TODO_GUIDANCE = [
  '**Task list (`update_todos`) — source of truth; plan markdown is auto-rendered:**',
  '- Turn the user\'s request into actionable tasks (one per numbered plan step).',
  '- Call `update_todos` with the COMPLETE list (all `pending`) — steps appear in `plans/<slug>.md` automatically.',
  '- For each todo include `content`, `success_criteria` (observable pass/fail), and `verify_command` when automatable (e.g. `npm test auth`, `test -f path/to/file`).',
  '- Optionally edit overview / files / risks in the plan file; step list stays driven by todos.',
  '- Before `exit_plan_mode`, call `read_todos` to verify tasks and acceptance criteria are present.',
].join('\n')

export function exitPlanReminder(): string {
  return [
    'Explore mode ended and was approved. The engine will execute approved plan tasks one-by-one using full tools.',
    'Each task runs in its own tool loop; progress syncs to `plans/todos.json` and `plans/<slug>.md`.',
    'If execution pauses for approval, resume when ready — remaining tasks continue automatically.',
  ].join(' ')
}

export function planExecutionContinuationReminder(): string {
  return [
    '`plans/todos.json` still has unfinished approved steps.',
    'Execute the next pending step using tools now — do not reply with text only.',
  ].join(' ')
}

export function fullPlanReminder(
  planPath: string | null,
  planFileExists: boolean,
  planWritten: boolean,
): string {
  let pathLine = 'Plan file: set a workspace folder so a plan file can be created.'
  if (planPath) {
    if (!planFileExists) {
      pathLine = `Plan file: \`${planPath}\` (created on enter_plan_mode — call update_todos to fill steps)`
    } else if (!planWritten) {
      pathLine =
        `Plan file: \`${planPath}\` (placeholder steps only — call update_todos with the full task list)`
    } else {
      pathLine = `Plan file: \`${planPath}\` (written — update if scope changes)`
    }
  }

  return [
    '**While Explore mode is active.** You MUST NOT make edits (except the plan file), run mutating commands, or change system state.',
    'This supersedes other mode instructions until you exit explore mode.',
    '',
    PLAN_MODE_PERSISTENCE_RULE,
    '',
    'Workflow:',
    '0. enter_plan_mode to start planning',
    '1. Explore read-only (read_file, lsp, web_search, web_scrape) — do NOT run shell or mutating commands during planning.',
    '2. design and seed the task list for downstream based on the user request (each step needs success_criteria; add verify_command when a shell check applies)',
    PLAN_MODE_TODO_GUIDANCE,
    '3. Call `exit_plan_mode` only after the plan file is written — the user must approve before implementation.',
    '',
    'Your turn should end with exit_plan_mode (or a clarifying question if requirements are unclear).',
    '**CRITICAL:** Do not call exit_plan_mode before all tasks are completed or cancelled.',
    '**CRITICAL:** You must call todos after enter_plan_mode to start planning.',
  ].join('\n')
}

export function reentryPlanReminder(planPath: string | null): string {
  return [
    '**Explore mode re-entry.** A written plan file already exists.',
    planPath ? `Continue editing: \`${planPath}\`` : '',
    'Research read-only as needed, update the plan file and sync `update_todos` with any scope changes, then call exit_plan_mode.',
    '',
    PLAN_MODE_PERSISTENCE_RULE,
    '',
    PLAN_MODE_TODO_GUIDANCE,
  ]
    .filter(Boolean)
    .join('\n')
}

function planFilePendingReminder(planPath: string | null): string {
  return [
    '**Plan file not written yet.** The plan must be saved to disk before exit_plan_mode.',
    planPath
      ? `Overwrite \`${planPath}\` with edit_files (mode write or replace) — do not leave the plan only in chat.`
      : 'Call enter_plan_mode or set a workspace so a plan file path is available.',
    '',
    PLAN_MODE_PERSISTENCE_RULE,
  ].join('\n')
}

export type PlanModeInjectionPhase =
  | 'execute'
  | 'executeContinuation'
  | 'enter'
  | 'reenter'
  | 'continue'

export type PlanModeInjectionSlice = {
  phase: PlanModeInjectionPhase
  instructionBlock: string
  userTrigger: string
}

function resolvePlanContext(
  conversationId: string,
  sandboxRoot?: string | null,
) {
  const state = getPlanModeStateForConversation(conversationId)
  const storage = resolvePlanModeStorage(conversationId, {
    sandboxRoot,
    slug: state.planSlug,
  })
  const planPath = storage?.planFile.displayPath ?? null
  const planFileExists =
    storage != null && existsSync(storage.planFile.absolutePath)
  const planWritten =
    storage != null &&
    planFileExists &&
    isPlanFileWritten(storage.planFile.absolutePath)
  const todoCount = readPlanModeTodoList(conversationId, {
    sandboxRoot,
    slug: state.planSlug,
  }).todos.length
  return { state, planPath, planFileExists, planWritten, todoCount }
}

function buildSlice(
  phase: PlanModeInjectionPhase,
  planPath: string | null,
  planFileExists: boolean,
  planWritten: boolean,
  todoCount: number,
): PlanModeInjectionSlice {
  switch (phase) {
    case 'execute':
      return {
        phase,
        instructionBlock: exitPlanReminder(),
        userTrigger: PLAN_MODE_USER_TRIGGERS.execute,
      }
    case 'executeContinuation':
      return {
        phase,
        instructionBlock: planExecutionContinuationReminder(),
        userTrigger: PLAN_MODE_USER_TRIGGERS.executeContinuation,
      }
    case 'enter':
      return {
        phase,
        instructionBlock: fullPlanReminder(planPath, planFileExists, planWritten),
        userTrigger: PLAN_MODE_USER_TRIGGERS.enter,
      }
    case 'reenter':
      return {
        phase,
        instructionBlock: reentryPlanReminder(planPath),
        userTrigger: PLAN_MODE_USER_TRIGGERS.reenter,
      }
    default: {
      const blocks = [SPARSE_REMINDER]
      if (planWritten && todoCount > 0) {
        blocks.unshift(PLAN_READY_EXIT_REMINDER)
      }
      if (!planWritten) {
        blocks.push('', planFilePendingReminder(planPath))
      }
      blocks.push('', PLAN_MODE_TODO_GUIDANCE)
      return {
        phase: 'continue',
        instructionBlock: blocks.join('\n'),
        userTrigger: PLAN_MODE_USER_TRIGGERS.continue,
      }
    }
  }
}

/**
 * Resolve the active plan-mode phase for this tool-loop step.
 * Consumes one-shot pending activation / execution flags when set.
 */
export function resolvePlanModeInjectionSlice(
  conversationId: string | undefined,
  _loopStep: number,
  sandboxRoot?: string | null,
): PlanModeInjectionSlice | null {
  const id = conversationId?.trim()
  if (!id) return null

  const { state, planPath, planFileExists, planWritten, todoCount } = resolvePlanContext(
    id,
    sandboxRoot,
  )

  if (state.status !== 'planning') {
    if (hasPendingPlanExecution(id) && consumePendingPlanExecution(id)) {
      return buildSlice('execute', null, false, false, 0)
    }
    if (hasExecuteContinuationReminder(id) && consumeExecuteContinuationReminder(id)) {
      return buildSlice('executeContinuation', null, false, false, 0)
    }
    return null
  }

  if (consumePendingPlanActivation(id)) {
    return buildSlice(
      planWritten ? 'reenter' : 'enter',
      planPath,
      planFileExists,
      planWritten,
      todoCount,
    )
  }

  return buildSlice('continue', planPath, planFileExists, planWritten, todoCount)
}

/**
 * Full plan-mode reminder text for system instructions.
 * Peeks at pending flags without consuming — consumption happens in user-role injection.
 */
export function resolvePlanModeInstructionBlock(
  conversationId: string | undefined,
  _loopStep: number,
  sandboxRoot?: string | null,
): string | null {
  const id = conversationId?.trim()
  if (!id) return null

  const { state, planPath, planFileExists, planWritten, todoCount } = resolvePlanContext(
    id,
    sandboxRoot,
  )

  if (hasPendingPlanExecution(id)) {
    return exitPlanReminder()
  }

  if (hasExecuteContinuationReminder(id)) {
    return planExecutionContinuationReminder()
  }

  if (state.status !== 'planning') return null

  if (hasPendingPlanActivation(id)) {
    return buildSlice(
      planWritten ? 'reenter' : 'enter',
      planPath,
      planFileExists,
      planWritten,
      todoCount,
    ).instructionBlock
  }

  return buildSlice('continue', planPath, planFileExists, planWritten, todoCount)
    .instructionBlock
}

/**
 * Kimi-style user-role trigger wrapped in system-reminder tags.
 * Short trigger text signals phase transitions; full reminder lives in instructions.
 */
export function resolvePlanModeUserReminder(
  conversationId: string | undefined,
  loopStep: number,
  sandboxRoot?: string | null,
): ModelMessage | null {
  const slice = resolvePlanModeInjectionSlice(
    conversationId,
    loopStep,
    sandboxRoot,
  )
  if (!slice) return null
  return wrapSystemReminder(slice.userTrigger)
}

/** YOLO-only user trigger when plan mode is inactive. */
export function resolveYoloModeUserReminder(
  conversationId: string | undefined,
): ModelMessage | null {
  const id = conversationId?.trim()
  if (!id) return null
  if (isPlanModeActive(id)) return null
  if (getCodingModeForConversation(id) !== 'yolo') return null
  return wrapSystemReminder(PLAN_MODE_USER_TRIGGERS.yolo)
}

function isPlanModeActive(conversationId: string): boolean {
  return getPlanModeStateForConversation(conversationId).status === 'planning'
}

/**
 * Plan-mode or YOLO user-role injection for a tool-loop step.
 * Returns null when neither mode applies.
 */
export function resolvePlanModeInjectionMessage(
  conversationId: string | undefined,
  loopStep: number,
  sandboxRoot?: string | null,
): ModelMessage | null {
  return (
    resolvePlanModeUserReminder(conversationId, loopStep, sandboxRoot) ??
    resolveYoloModeUserReminder(conversationId)
  )
}
