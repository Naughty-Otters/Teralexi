import type { SkillTool, SkillToolModule } from './types'

/**
 * Events aligned with Codex CLI / Claude Code hook vocabulary, plus events
 * unique to OpenFDE (channels, memory, workflows, skill install). Not every
 * event is dispatched yet — see docs/EXTENSION-HOOKS-ARCHITECTURE.md §4.1 for
 * which call sites exist today vs. are planned for a later phase.
 */
export type HookEvent =
  | 'onSessionStart'
  | 'SessionEnd'
  | 'preHook'
  | 'postHook'
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'onApprovalRequired'
  | 'PreCompact'
  | 'PostCompact'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreMcpToolUse'
  | 'PostMcpToolUse'
  | 'ChannelMessageReceived'
  | 'ChannelMessageSend'
  | 'SkillInstall'
  | 'SkillUpdate'
  | 'WorkflowDeploy'
  | 'WorkflowRun'
  | 'MemoryWrite'
  | 'MemoryRecall'

export type HookInvocationContext = {
  event: HookEvent
  conversationId?: string
  agentId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  channelId?: string
  workspacePath?: string | null
  userMessage?: string
  [key: string]: unknown
}

export type HookResult = {
  continue: boolean
  stopReason?: string
  hookSpecificOutput?: {
    additionalContext?: string
    updatedInput?: Record<string, unknown>
    permissionDecision?: 'allow' | 'deny' | 'ask'
  }
}

export type HookHandler = (
  ctx: HookInvocationContext,
) => Promise<HookResult> | HookResult

export type HookBinding =
  | { type: 'command'; command: string; args?: string[]; timeout?: number }
  | { type: 'function'; module: string; export: string }
  | { type: 'prompt'; prompt: string; model?: string }
  | { type: 'agent'; agentId: string }

export type ActivationEvent =
  | 'onStartup'
  | 'onChatOpen'
  | 'onCommand'
  | 'onChannelMessage'

export interface ExtensionPermissions {
  network?: boolean
  filesystem?: 'none' | 'workspace' | 'full'
  shell?: boolean
  /** Credential ids this extension needs access to, e.g. `['google-oauth']`. */
  credentials?: string[]
}

/**
 * `extension.json` — the on-disk manifest for an installable Extension.
 * JSON-serializable only: no functions/class instances can live here, which is
 * why `channels`/`llmProviders`/`uiPanels`/`composerToolbarPlugins` are NOT
 * manifest fields (see {@link ExtensionActionsModule} below for those) — only
 * `hooks` is, because every {@link HookBinding} variant is plain data (a
 * command string, a module+export pointer, a prompt string, an agent id).
 *
 * Fully optional: a bare skill directory with no `extension.json` remains a
 * valid skill, exactly as it is today. `contributes.hooks` is itself optional
 * — hooks can also come from the legacy flat `hooks/hooks.json` file (same
 * shape as today's `~/.teralexi/hooks.json`) discovered by convention.
 */
export interface ExtensionManifest {
  id: string
  version: string
  permissions?: ExtensionPermissions
  activationEvents?: ActivationEvent[]
  contributes?: {
    hooks?: Partial<Record<HookEvent, HookBinding[]>>
  }
}

/** Duplicated locally (not imported from main) to keep the SDK dependency-light. */
export interface ExtensionChannelSender {
  sendToTarget(target: string, text: string): Promise<void>
}

export interface ExtensionProviderAdapter {
  createModel(modelId: string, creds: unknown): unknown
}

export interface LlmProviderContribution {
  label: string
  /** Instance conforming to {@link ExtensionProviderAdapter}. */
  adapter: ExtensionProviderAdapter
  credentialFields?: string[]
}

export interface UiPanelContribution {
  label: string
  /** Renderer-side entry point, resolved relative to the extension directory. */
  component: string
}

/**
 * What an extension's `actions/index.ts` may export — a superset of
 * {@link SkillToolModule}, which already covers `tools`/`composerToolbarPlugins`
 * for skills today. Loaded through the same sandboxed esbuild+CJS `require`
 * `skill-module-loader.ts` uses, not validated by the JSON schema (it's code,
 * not data) — the extension host reads these exports after the module runs.
 */
export interface ExtensionActionsModule extends SkillToolModule {
  channels?: Record<string, ExtensionChannelSender>
  llmProviders?: Record<string, LlmProviderContribution>
  uiPanels?: Record<string, UiPanelContribution>
  hooks?: Partial<Record<HookEvent, HookHandler>>
}

export type { SkillTool, SkillToolModule }
