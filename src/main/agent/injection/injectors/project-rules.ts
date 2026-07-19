import { join } from 'node:path'
import { getTeralexiRulesDir } from '@config/teralexi-home'
import { loadConversationWorkspace } from '../../workspace/conversation-workspace'
import {
  formatProjectRulesBlock,
  loadProjectRules,
} from '@shared/agent/project-rules'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'
import { createMtimeKeyedCache, pathMtimeKey } from '../injector-cache'

const projectRulesCache = createMtimeKeyedCache<string>()

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
    const userRulesDir = getTeralexiRulesDir()
    const workspaceRulesDir = workspacePath
      ? join(workspacePath, '.teralexi', 'rules')
      : null
    return (
      projectRulesCache.getOrCompute(
        [pathMtimeKey(userRulesDir), pathMtimeKey(workspaceRulesDir)],
        () => {
          const rules = loadProjectRules({
            userRulesDir,
            workspaceRulesDir,
          })
          return formatProjectRulesBlock(rules) || ''
        },
      ) || null
    )
  },
}
