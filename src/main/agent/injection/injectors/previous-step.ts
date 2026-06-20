import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const previousStepInjector: AgentInjector = {
  id: 'previous-step',
  order: INJECTOR_ORDER.PREVIOUS_STEP,
  applies({ profile, todo }) {
    if (profile.stage === 'todoExecution') {
      return Boolean(todo?.previousStepBlock?.trim())
    }
    return profile.stage === 'toolLoop'
  },
  injectInstructions({ profile, ctx, todo }) {
    if (profile.stage === 'todoExecution') {
      return todo?.previousStepBlock?.trim() || null
    }
    const block = ctx.renderPreviousStepContextBlock()
    return block?.trim() || null
  },
}
