import type {
  HookEvent,
  HookHandler,
  HookResult,
} from '@teralexi/skill-sdk'

export type { HookEvent, HookHandler, HookResult }

/** Events dispatched by the runtime today (subset of full {@link HookEvent}). */
export const RUNTIME_HOOK_EVENTS = [
  'onSessionStart',
  'preHook',
  'postHook',
  'beforeToolCall',
  'afterToolCall',
  'onApprovalRequired',
  'PreMcpToolUse',
  'PostMcpToolUse',
] as const satisfies readonly HookEvent[]

export type RuntimeHookEvent = (typeof RUNTIME_HOOK_EVENTS)[number]

export type HookSpecificOutput = NonNullable<HookResult['hookSpecificOutput']>

export type HookRunResult = {
  blocked: boolean
  message?: string
  hookSpecificOutput?: HookSpecificOutput
}

/** Payload passed to every hook handler / command subprocess. */
export type HookInvocationContext = {
  event: HookEvent
  conversationId?: string
  agentId?: string
  assistantMessageId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  channelId?: string
  workspacePath?: string | null
  userMessage?: string
  hasError?: boolean
  errorMessage?: string
  finalContent?: string
  [key: string]: unknown
}

export type HookBindingSource =
  | 'extension-manifest'
  | 'extension-hooks-json'
  | 'extension-module'
  | 'project-hooks-json'
  | 'global-hooks-json'
  | 'conversation'

export type RunnableCommandHookBinding = {
  type: 'command'
  event: HookEvent
  command: string
  args?: string[]
  timeout?: number
  source: HookBindingSource
  extensionId?: string
  trustKey?: string
  enabled?: boolean
  id?: string
}

export type RunnableFunctionHookBinding = {
  type: 'function'
  event: HookEvent
  handler: HookHandler
  source: HookBindingSource
  extensionId?: string
  trustKey?: string
  enabled?: boolean
}

/** Unresolved function pointer from manifest / hooks.json — resolved at extension load. */
export type RunnableFunctionRefHookBinding = {
  type: 'function-ref'
  event: HookEvent
  module: string
  export: string
  source: HookBindingSource
  extensionId?: string
  trustKey?: string
  enabled?: boolean
}

export type RunnablePromptHookBinding = {
  type: 'prompt'
  event: HookEvent
  prompt: string
  model?: string
  source: HookBindingSource
  extensionId?: string
  trustKey?: string
  enabled?: boolean
}

export type RunnableAgentHookBinding = {
  type: 'agent'
  event: HookEvent
  agentId: string
  source: HookBindingSource
  extensionId?: string
  trustKey?: string
  enabled?: boolean
}

export type RunnableHookBinding =
  | RunnableCommandHookBinding
  | RunnableFunctionHookBinding
  | RunnableFunctionRefHookBinding
  | RunnablePromptHookBinding
  | RunnableAgentHookBinding

/** Events where a failed hook, stderr, or `continue: false` blocks the action. */
export const BLOCKING_HOOK_EVENTS = new Set<HookEvent>([
  'beforeToolCall',
  'preHook',
  'PreMcpToolUse',
  'onApprovalRequired',
])
