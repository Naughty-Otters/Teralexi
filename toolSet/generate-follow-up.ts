import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  buildFollowUpMeta,
  FOLLOWUP_META_REL_PATH,
  type FollowUpItemInput,
  type GenerateFollowUpMode,
} from '@shared/agent/follow-up'
import { readFollowUpMeta, writeFollowUpMeta } from '@main/agent/follow-up'
import {
  getConversationIdFromEnv,
  getSandboxRootFromEnv,
  requireActiveSandbox,
} from './sandbox-paths'

const FOLLOWUP_TAG = ['follow-up'] as const

const userInputActionSchema = z.object({
  type: z.literal('user_input'),
  message: z
    .string()
    .min(1)
    .describe('Exact next user message / command to send when chosen.'),
})

const toolCallActionSchema = z.object({
  type: z.literal('tool_call'),
  tool: z.string().min(1).describe('Registered tool name to invoke.'),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('JSON object of tool arguments.'),
})

const followUpActionSchema = z.discriminatedUnion('type', [
  userInputActionSchema,
  toolCallActionSchema,
])

const followUpItemInputSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Optional stable id; generated when omitted.'),
  label: z
    .string()
    .min(1)
    .describe(
      'Short human explanation of the suggested next step (based on the current user input and assistant reply).',
    ),
  action: followUpActionSchema.describe(
    'Either a user_input message to send, or a tool_call to run.',
  ),
  priority: z
    .number()
    .int()
    .optional()
    .describe('Lower numbers appear first. Optional.'),
})

const generateFollowUpInputSchema = z.object({
  follow_ups: z
    .array(followUpItemInputSchema)
    .min(1)
    .describe(
      'One or more follow-up suggestions for the current turn. Multiple actions are allowed for the same user input.',
    ),
  mode: z
    .enum(['replace', 'append'])
    .optional()
    .default('replace')
    .describe(
      'replace (default) overwrites followup/meta.json; append merges by id.',
    ),
  source_user_message: z
    .string()
    .optional()
    .describe('Optional user message / summary that motivated these suggestions.'),
})

/**
 * generate_follow_up — persist suggested next steps for this conversation.
 *
 * Writes `<sandbox>/followup/meta.json` (conversation sandbox is already
 * keyed by conversation id hash under ~/.teralexi/workspace/sandbox/).
 */
export const generateFollowUp: SkillTool = {
  name: 'generate_follow_up',
  tags: [...FOLLOWUP_TAG],
  description:
    'Create or update suggested follow-up actions for this conversation. ' +
    'Writes followup/meta.json under the conversation sandbox. ' +
    'Each item needs a label (what to do next) and an action: ' +
    'user_input (pre-fill/send a message) or tool_call (run a tool with args). ' +
    'Pass multiple follow_ups when several next steps make sense for the same turn.',
  inputSchema: generateFollowUpInputSchema,
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) {
      return { error: sandbox.message }
    }
    const sandboxRoot = getSandboxRootFromEnv() ?? sandbox.root
    const conversationId = getConversationIdFromEnv()?.trim()
    if (!conversationId) {
      return {
        error:
          'No conversation id bound to the sandbox; follow-ups require an active conversation.',
      }
    }

    const parsed = generateFollowUpInputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        error: 'Invalid generate_follow_up input.',
        detail: parsed.error.flatten(),
      }
    }

    const mode: GenerateFollowUpMode = parsed.data.mode ?? 'replace'
    const existing =
      mode === 'append' ? readFollowUpMeta(sandboxRoot, conversationId) : null

    const items: FollowUpItemInput[] = parsed.data.follow_ups.map((row) => ({
      id: row.id,
      label: row.label,
      action: row.action,
      priority: row.priority,
    }))

    const source: {
      userMessage?: string
      assistantMessageId?: string
    } = {}
    const userMessage =
      parsed.data.source_user_message?.trim() ||
      existing?.source?.userMessage?.trim()
    if (userMessage) source.userMessage = userMessage
    if (existing?.source?.assistantMessageId?.trim()) {
      source.assistantMessageId = existing.source.assistantMessageId.trim()
    }

    const meta = buildFollowUpMeta({
      conversationId,
      items,
      mode,
      existing,
      source: Object.keys(source).length > 0 ? source : undefined,
    })

    const written = writeFollowUpMeta(sandboxRoot, meta)
    if (!written) {
      return { error: `Failed to write ${FOLLOWUP_META_REL_PATH}` }
    }

    return {
      ok: true,
      path: FOLLOWUP_META_REL_PATH,
      absolutePath: written,
      conversationId,
      count: meta.followUps.length,
      mode,
      followUps: meta.followUps,
    }
  },
}

export const followUpTools: SkillTool[] = [generateFollowUp]
