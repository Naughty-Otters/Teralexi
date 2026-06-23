import type { AgentInjector } from '../types'
import { DIAGRAM_OUTPUT_INSTRUCTIONS } from '@shared/agent/diagram-output-instructions'
import { INJECTOR_ORDER } from './orders'

export {
  DIAGRAM_OUTPUT_INSTRUCTIONS,
  DIAGRAM_NO_RUN_SCRIPT_RULE,
  DIAGRAM_THINKING_ROUTING_HINT,
} from '@shared/agent/diagram-output-instructions'

export const diagramOutputInjector: AgentInjector = {
  id: 'diagram-output',
  order: INJECTOR_ORDER.DIAGRAM_OUTPUT,
  applies({ profile }) {
    return profile.stage === 'toolLoop'
  },
  injectInstructions() {
    return DIAGRAM_OUTPUT_INSTRUCTIONS
  },
}
