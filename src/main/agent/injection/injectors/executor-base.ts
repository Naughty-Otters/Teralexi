import { SKILLS_TOOL_EXECUTION_LLM } from '../../constants/skills-tool-llm'
import { isPlanExecutionActive } from '../../coding/plan-mode-state'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const executorBaseInjector: AgentInjector = {
  id: 'executor-base',
  order: INJECTOR_ORDER.EXECUTOR_BASE,
  applies({ profile }) {
    return profile.stage === 'todoExecution'
  },
  injectInstructions({ todo, ctx }) {
    if (!todo) return null
    const planBlock = isPlanExecutionActive(ctx.opts.conversationId)
      ? `\n\n${SKILLS_TOOL_EXECUTION_LLM.PLAN_EXECUTION_DISCIPLINE}`
      : ''
    return `${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_BASE}${planBlock}

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_ATTEMPT_LABEL} ${todo.attempt}/${todo.maxAttempts}`
  },
}
