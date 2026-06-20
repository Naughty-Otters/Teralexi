import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const workspaceStructureInjector: AgentInjector = {
  id: 'workspace-structure',
  order: INJECTOR_ORDER.WORKSPACE_STRUCTURE,
  applies() {
    return true
  },
  injectInstructions({ ctx }) {
    const block = ctx.sandbox.buildWorkspaceStructureBlock()
    return block?.trim() || null
  },
}
