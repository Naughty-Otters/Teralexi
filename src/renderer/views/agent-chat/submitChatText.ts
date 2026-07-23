import type { InjectionKey } from 'vue'
import type { TrackedTodo } from '@shared/agent/todos'

export type SubmitChatTextFn = (text: string) => void | Promise<void>

export const SUBMIT_CHAT_TEXT_KEY: InjectionKey<SubmitChatTextFn> =
  Symbol('submitChatText')

/** Build the user prompt that asks the agent to fan out pending todos via invoke_agents. */
export function buildParallelTodosPrompt(todos: readonly TrackedTodo[]): string {
  const lines = todos.map((t, i) => `${i + 1}. ${t.content.trim()}`)
  return [
    'Run these independent todos in parallel using `invoke_agents` (one run per todo; waits for all).',
    'Prefer one specialist (or coding) agent per todo. File-mutating work should use isolated git worktrees.',
    '',
    ...lines,
  ].join('\n')
}
