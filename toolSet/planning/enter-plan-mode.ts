import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { clearExploreManifest } from '@main/agent/coding/explore-manifest'
import { enterPlanModeBlockedReason } from '@main/agent/coding/plan-mode-enter-guard'
import {
  bootstrapPlanModeStorage,
  planModeFor,
  planModeStorageOptionsFromEnv,
} from '@main/agent/coding/plan-mode-state'
import { getConversationIdFromEnv } from '../sandbox-paths'
import { ENTER_PLAN_MODE_TOOL_NAME, PLANNING_TAG } from './constants'

export const enterPlanMode: SkillTool = {
  name: ENTER_PLAN_MODE_TOOL_NAME,
  tags: [...PLANNING_TAG],
  description:
    'Enter explore mode: read-only exploration until you write a plan and exit for user approval. ' +
    'Creates plans/<slug>.md and plans/todos.json in the conversation sandbox.',
  inputSchema: z.object({
    title: z
      .string()
      .optional()
      .describe('Short title for the plan (used in plan filename slug).'),
  }),
  needsApproval: true,
  async execute(input) {
    const conversationId = getConversationIdFromEnv()
    if (!conversationId) {
      return { error: 'enter_plan_mode requires an active conversation.' }
    }

    const storageOptions = planModeStorageOptionsFromEnv(conversationId)
    const blocked = enterPlanModeBlockedReason(conversationId, storageOptions)
    if (blocked) {
      return { error: blocked }
    }

    const parsed = z.object({ title: z.string().optional() }).safeParse(input)
    const title = parsed.success ? parsed.data.title : undefined

    planModeFor(conversationId).activatePlanning({
      trigger: 'tool:enter_plan_mode',
    })

    clearExploreManifest(conversationId, storageOptions)

    const storage = bootstrapPlanModeStorage(
      conversationId,
      title,
      storageOptions,
    )
    if (!storage) {
      return {
        error:
          'No sandbox available for this conversation; cannot create plan storage.',
      }
    }

    return {
      ok: true,
      status: 'planning',
      planSlug: storage.planFile.slug,
      planFilePath: storage.planFile.displayPath,
      todosFilePath: storage.todosFile.displayPath,
      message:
        'Explore mode active. Research read-only, call update_todos (writes plans/todos.json and syncs the plan file), then exit_plan_mode for approval.',
    }
  },
}
