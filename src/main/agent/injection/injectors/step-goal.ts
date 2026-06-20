import { SKILLS_TOOL_EXECUTION_LLM } from '../../constants/skills-tool-llm'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const stepGoalInjector: AgentInjector = {
  id: 'step-goal',
  order: INJECTOR_ORDER.STEP_GOAL,
  applies({ profile }) {
    return profile.stage === 'todoExecution'
  },
  injectInstructions({ todo }) {
    if (!todo) return null
    let block = `${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_STEP_GOAL_LABEL}
${todo.stepGoal}`

    if (todo.lastRetryContext.trim()) {
      block += `

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_PREVIOUS_CONTEXT_LABEL}
${todo.lastRetryContext}

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_RETRY_GUIDANCE}`
    }
    return block
  },
}
