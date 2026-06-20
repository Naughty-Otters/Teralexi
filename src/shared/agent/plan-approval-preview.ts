import type { TrackedTodo } from './todos'

export type PlanApprovalPreviewResult =
  | {
      ok: true
      planMarkdown: string
      planFilePath: string
      todosFilePath: string
      todos: TrackedTodo[]
      checklist: string
      agentSummary?: string
    }
  | { ok: false; error: string }
