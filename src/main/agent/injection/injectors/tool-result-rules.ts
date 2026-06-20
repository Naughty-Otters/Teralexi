import { SKILLS_TOOL_EXECUTION_LLM } from '../../constants/skills-tool-llm'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const toolResultRulesInjector: AgentInjector = {
  id: 'tool-result-rules',
  order: INJECTOR_ORDER.TOOL_RESULT_RULES,
  applies({ profile }) {
    return profile.stage === 'todoExecution'
  },
  injectInstructions() {
    return SKILLS_TOOL_EXECUTION_LLM.TOOL_RESULT_DECISION_RULES.trim()
  },
}
