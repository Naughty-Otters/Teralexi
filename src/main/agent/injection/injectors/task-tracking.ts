import type { AgentInjector } from '../types'
import type { RuntimeToolMeta } from '../../types'
import { isPlanExecutionActive } from '../../coding/plan-mode-state'
import { INJECTOR_ORDER } from './orders'

export function buildTaskTrackingBlock(
  tools: RuntimeToolMeta[],
  conversationId?: string,
): string {
  const hasUpdateTodos = tools.some((t) => t.name === 'update_todos')
  if (!hasUpdateTodos) return ''
  if (isPlanExecutionActive(conversationId)) {
    return [
      '### Task tracking (approved plan execution)',
      'The foreach orchestrator drives tasks from `plans/todos.json` one at a time.',
      'Focus on the current task in your step goal — do not start follow-up work beyond it.',
      'You may call `update_todos` only to change status on the current assigned ' +
        'approved step (at most one status change). Do not add, remove, reorder, rewrite step text, ' +
        'or update any other plan step.',
      'When `summary.allDone` is true, do not call `update_todos` again — finish the current step with a brief text summary.',
      'You may call `exit_plan_mode` to leave planning when the plan is ready or scope changes require it.',
      'Do not call `enter_plan_mode` again until execution finishes.',
    ].join('\n')
  }
  return [
    '### Task tracking (`update_todos`)',
    'For any job with 3+ steps, keep the task list current with `update_todos` (it is seeded from the plan):',
    '- Send the COMPLETE list each call (full replace).',
    '- Mark exactly ONE task `in_progress` before you start working it.',
    '- Mark it `completed` immediately when done — do not batch completions.',
    '- Append new tasks as you discover them; mark obsolete ones `cancelled`.',
    '- When `summary.allDone` is true, do not call `update_todos` again — reply with a brief text summary and stop.',
    '- Skip the tracker only for trivial single-step requests.',
  ].join('\n')
}

export const taskTrackingInjector: AgentInjector = {
  id: 'task-tracking',
  order: INJECTOR_ORDER.TASK_TRACKING,
  applies({ profile }) {
    return profile.stage === 'toolLoop' && profile.isCodingAgent
  },
  injectInstructions({ tools, ctx }) {
    const block = buildTaskTrackingBlock(tools, ctx.opts.conversationId)
    return block || null
  },
}
