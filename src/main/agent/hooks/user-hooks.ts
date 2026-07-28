import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConversationHookEntry } from '@shared/agent/conversation-hooks'
import type {
  HookEvent,
  HookInvocationContext,
  HookRunResult,
  HookSpecificOutput,
  RunnableAgentHookBinding,
  RunnableCommandHookBinding,
  RunnableFunctionHookBinding,
  RunnableHookBinding,
  RunnablePromptHookBinding,
} from '@shared/agent/hooks'
import { BLOCKING_HOOK_EVENTS } from '@shared/agent/hooks'
import {
  filterBindingsForEvent,
  normalizeConversationHooks,
  normalizeFlatHooksFile,
} from './hook-binding-normalizer'
import { mergeHookResults } from './hook-result-applier'
import { execAgentHook } from './hook-agent-executor'
import { execPromptHook } from './hook-prompt-executor'
import { getExtensionHookBindings } from '@main/skills/extension-host'
import type { ProviderCredentials } from '@main/agent/types'
import type { HookResult } from '@teralexi/skill-sdk'
import type { SubAgentParentRun } from '@toolSet/sub-agents/delegation-context'

export type { HookEvent, HookInvocationContext, HookRunResult }

/** @deprecated Use {@link HookEvent} */
export type UserHookEvent = HookEvent

/** @deprecated Legacy flat hook entry shape */
export type UserHookEntry = {
  event: HookEvent
  command: string
  args?: string[]
  id?: string
  enabled?: boolean
}

export type UserHooksConfig = {
  hooks: UserHookEntry[]
}

export type RunUserHooksOptions = {
  userId?: string
  workspacePath?: string
  credentials?: ProviderCredentials
  defaultProvider?: string
  defaultModel?: string
  hookDelegation?: {
    parentRun?: SubAgentParentRun
    parentOpts?: Record<string, unknown>
  }
}

const GLOBAL_HOOKS_PATH = join(homedir(), '.teralexi', 'hooks.json')

function projectHooksPath(workspacePath?: string): string {
  const base = workspacePath?.trim() || process.cwd()
  return join(base, '.teralexi', 'hooks.json')
}

let cachedProjectHooksPath: string | undefined
let cachedProjectHooks: RunnableHookBinding[] | undefined
let cachedGlobalHooks: RunnableHookBinding[] | undefined

export function clearUserHooksCache(): void {
  cachedProjectHooksPath = undefined
  cachedProjectHooks = undefined
  cachedGlobalHooks = undefined
}

function readHooksFileBindings(
  path: string,
  source: 'global-hooks-json' | 'project-hooks-json',
): RunnableHookBinding[] {
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return normalizeFlatHooksFile(raw, source)
  } catch {
    return []
  }
}

function loadGlobalHookBindings(): RunnableHookBinding[] {
  if (cachedGlobalHooks) return cachedGlobalHooks
  cachedGlobalHooks = readHooksFileBindings(GLOBAL_HOOKS_PATH, 'global-hooks-json')
  return cachedGlobalHooks
}

function loadProjectHookBindings(workspacePath?: string): RunnableHookBinding[] {
  const path = projectHooksPath(workspacePath)
  if (cachedProjectHooks && cachedProjectHooksPath === path) {
    return cachedProjectHooks
  }
  cachedProjectHooksPath = path
  cachedProjectHooks = readHooksFileBindings(path, 'project-hooks-json')
  return cachedProjectHooks
}

async function collectBindingsForEvent(
  event: HookEvent,
  extraHooks: ConversationHookEntry[],
  options?: RunUserHooksOptions,
): Promise<RunnableHookBinding[]> {
  const extensionBindings = options?.userId
    ? filterBindingsForEvent(
        await getExtensionHookBindings(options.userId, options.workspacePath),
        event,
      )
    : []

  const projectBindings = filterBindingsForEvent(
    loadProjectHookBindings(options?.workspacePath),
    event,
  )
  const globalBindings = filterBindingsForEvent(loadGlobalHookBindings(), event)
  const conversationBindings = filterBindingsForEvent(
    normalizeConversationHooks(extraHooks),
    event,
  )

  return [
    ...extensionBindings,
    ...projectBindings,
    ...globalBindings,
    ...conversationBindings,
  ]
}

function execHookCommand(
  binding: RunnableCommandHookBinding,
  payload: string,
): Promise<{ stdout: string; stderr: string; error?: Error }> {
  const timeout = binding.timeout ?? 30_000
  return new Promise((resolve) => {
    const child = execFile(
      binding.command,
      [...(binding.args ?? []), payload],
      { timeout, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({ stdout, stderr, error: error ?? undefined })
      },
    )
    child.stdin?.end(payload)
  })
}

async function execFunctionHook(
  binding: RunnableFunctionHookBinding,
  ctx: HookInvocationContext,
): Promise<HookRunResult> {
  try {
    const result: HookResult = await binding.handler(ctx)
    if (!result.continue) {
      return {
        blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
        message: result.stopReason ?? 'Blocked by extension hook',
        hookSpecificOutput: result.hookSpecificOutput,
      }
    }
    return {
      blocked: false,
      ...(result.hookSpecificOutput ? { hookSpecificOutput: result.hookSpecificOutput } : {}),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
      message: `Hook failed: ${message}`,
    }
  }
}

function parseHookStdout(stdout: string): HookSpecificOutput | undefined {
  const trimmed = stdout?.trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed) as { hookSpecificOutput?: HookSpecificOutput }
    return parsed?.hookSpecificOutput
  } catch {
    return undefined
  }
}

async function runBinding(
  binding: RunnableHookBinding,
  ctx: HookInvocationContext,
  payload: string,
  options?: RunUserHooksOptions,
): Promise<HookRunResult> {
  if (binding.type === 'function') {
    return execFunctionHook(binding, ctx)
  }
  if (binding.type === 'prompt') {
    return execPromptHook(binding as RunnablePromptHookBinding, ctx, options)
  }
  if (binding.type === 'agent') {
    return execAgentHook(binding as RunnableAgentHookBinding, ctx, options)
  }
  if (binding.type === 'function-ref') {
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
      message: 'Unresolved function hook binding',
    }
  }

  const { stdout, stderr, error } = await execHookCommand(binding, payload)
  const blocking = BLOCKING_HOOK_EVENTS.has(ctx.event)

  if (error) {
    return {
      blocked: blocking,
      message: blocking ? `Hook blocked: ${error.message}` : undefined,
    }
  }
  if (stderr?.trim() && blocking) {
    return { blocked: true, message: stderr.trim() }
  }

  const hookSpecificOutput = parseHookStdout(stdout)
  return {
    blocked: false,
    ...(hookSpecificOutput ? { hookSpecificOutput } : {}),
  }
}

/**
 * Run matching hooks for an event in layer order:
 * extension → project hooks.json → global hooks.json → conversation hooks.
 */
export async function runUserHooks(
  ctx: HookInvocationContext,
  extraHooks: ConversationHookEntry[] = [],
  options?: RunUserHooksOptions,
): Promise<HookRunResult> {
  const bindings = await collectBindingsForEvent(ctx.event, extraHooks, options)
  if (bindings.length === 0) return { blocked: false }

  const payload = JSON.stringify(ctx)
  let accumulated: HookRunResult = { blocked: false }

  for (const binding of bindings) {
    const result = await runBinding(binding, ctx, payload, options)
    if (result.blocked) return result
    accumulated = mergeHookResults(accumulated, result)
  }

  return accumulated
}

/** @deprecated Use {@link loadGlobalHookBindings} via runUserHooks */
export function loadUserHooksConfig(): UserHooksConfig {
  return {
    hooks: loadGlobalHookBindings()
      .filter((b): b is RunnableCommandHookBinding => b.type === 'command')
      .map((b) => ({
        event: b.event,
        command: b.command,
        args: b.args,
        id: b.id,
        enabled: b.enabled,
      })),
  }
}
