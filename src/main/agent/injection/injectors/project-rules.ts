import { join } from 'node:path'
import { getopenfdeRulesDir } from '@config/openfde-home'
import { loadConversationWorkspace } from '../../workspace/conversation-workspace'
import {
  formatProjectRulesBlock,
  loadProjectRules,
} from '@shared/agent/project-rules'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const projectRulesInjector: AgentInjector = {
  id: 'project-rules',
  order: INJECTOR_ORDER.PROJECT_RULES,
  applies() {
    return true
  },
  injectInstructions({ ctx }) {
    const workspacePath = ctx.opts.conversationId
      ? loadConversationWorkspace(ctx.opts.conversationId)
      : null
    const rules = loadProjectRules({
      userRulesDir: getopenfdeRulesDir(),
      workspaceRulesDir: workspacePath
        ? join(workspacePath, '.openfde', 'rules')
        : null,
    })
    const block = formatProjectRulesBlock(rules)
    return block || null
  },
}
