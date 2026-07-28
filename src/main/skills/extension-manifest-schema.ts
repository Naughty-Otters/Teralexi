import { z } from 'zod'
import type { ExtensionManifest } from '@teralexi/skill-sdk'

const hookEventSchema = z.enum([
  'onSessionStart',
  'SessionEnd',
  'preHook',
  'postHook',
  'beforeToolCall',
  'afterToolCall',
  'onApprovalRequired',
  'PreCompact',
  'PostCompact',
  'SubagentStart',
  'SubagentStop',
  'PreMcpToolUse',
  'PostMcpToolUse',
  'ChannelMessageReceived',
  'ChannelMessageSend',
  'SkillInstall',
  'SkillUpdate',
  'WorkflowDeploy',
  'WorkflowRun',
  'MemoryWrite',
  'MemoryRecall',
])

const hookBindingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('command'),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    timeout: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('function'),
    module: z.string().min(1),
    export: z.string().min(1),
  }),
  z.object({
    type: z.literal('prompt'),
    prompt: z.string().min(1),
    model: z.string().optional(),
  }),
  z.object({
    type: z.literal('agent'),
    agentId: z.string().min(1),
  }),
])

const activationEventSchema = z.enum([
  'onStartup',
  'onChatOpen',
  'onCommand',
  'onChannelMessage',
])

const permissionsSchema = z.object({
  network: z.boolean().optional(),
  filesystem: z.enum(['none', 'workspace', 'full']).optional(),
  shell: z.boolean().optional(),
  credentials: z.array(z.string()).optional(),
})

const hooksMapSchema = z
  .record(z.string(), z.array(hookBindingSchema))
  .refine(
    (hooks) => Object.keys(hooks).every((key) => hookEventSchema.safeParse(key).success),
    { message: 'contributes.hooks keys must be valid HookEvent names' },
  )

/**
 * Mirrors `ExtensionManifest` in `skill-sdk/extension-types.ts` — keep in sync.
 * `contributes.hooks` is validated key-by-key against `hookEventSchema`
 * rather than typed as `z.record(hookEventSchema, ...)`, since zod's enum-keyed
 * record infers all keys as required — the manifest field is optional per key.
 */
export const extensionManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  permissions: permissionsSchema.optional(),
  activationEvents: z.array(activationEventSchema).optional(),
  contributes: z
    .object({
      hooks: hooksMapSchema.optional(),
    })
    .optional(),
})

export type ExtensionManifestParseResult =
  | { ok: true; manifest: ExtensionManifest }
  | { ok: false; message: string }

export function parseExtensionManifest(raw: unknown): ExtensionManifestParseResult {
  const result = extensionManifestSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, message: result.error.message }
  }
  return { ok: true, manifest: result.data as ExtensionManifest }
}
