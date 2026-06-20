import { buildMemoryPersonaInstructionBlock } from '../../memory/memory-persona-injection'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const memoryPersonaInjector: AgentInjector = {
  id: 'memory-persona',
  order: INJECTOR_ORDER.MEMORY_PERSONA,
  applies() {
    return true
  },
  injectInstructions({ ctx }) {
    const block = buildMemoryPersonaInstructionBlock({
      userId: ctx.opts.userId,
      agentId: ctx.opts.agentId,
      skillId: ctx.opts.skillId,
    })
    return block || null
  },
}
