import { existsSync, readFileSync } from 'node:fs'
import type { PlanApprovalPreviewResult } from '@shared/agent/plan-approval-preview'
import { renderTodoChecklist } from '@shared/agent/todos'
import {
  planModeStorageOptionsFromEnv,
  readPlanModeTodoList,
  resolvePlanModeStorage,
} from './plan-mode-storage-impl'

export function previewPlanApproval(args: {
  conversationId: string
  agentSummary?: string
}): PlanApprovalPreviewResult {
  const conversationId = args.conversationId?.trim()
  if (!conversationId) {
    return { ok: false, error: 'conversationId is required.' }
  }

  const storageOptions = planModeStorageOptionsFromEnv(conversationId)
  const storage = resolvePlanModeStorage(conversationId, storageOptions)
  if (!storage) {
    return { ok: false, error: 'No plan storage for this conversation.' }
  }

  const planPath = storage.planFile.absolutePath
  if (!existsSync(planPath)) {
    return {
      ok: false,
      error: `Plan file not found at ${storage.planFile.displayPath}.`,
    }
  }

  let planMarkdown = ''
  try {
    planMarkdown = readFileSync(planPath, 'utf8')
  } catch {
    return { ok: false, error: 'Could not read the plan file.' }
  }

  const list = readPlanModeTodoList(conversationId, storageOptions)
  return {
    ok: true,
    planMarkdown,
    planFilePath: storage.planFile.displayPath,
    todosFilePath: storage.todosFile.displayPath,
    todos: list.todos,
    checklist: renderTodoChecklist(list),
    agentSummary: args.agentSummary?.trim() || undefined,
  }
}
