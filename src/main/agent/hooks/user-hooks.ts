import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

export type UserHookEvent =
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'onSessionStart'
  | 'onApprovalRequired'

export type UserHookEntry = {
  event: UserHookEvent
  command: string
  args?: string[]
}

export type UserHooksConfig = {
  hooks: UserHookEntry[]
}

export type HookInvocationContext = {
  event: UserHookEvent
  conversationId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  workspacePath?: string | null
}

const HOOK_PATHS = [
  join(homedir(), '.teralexi', 'hooks.json'),
  join(process.cwd(), '.teralexi', 'hooks.json'),
]

let cachedConfig: UserHooksConfig | null | undefined

export function clearUserHooksCache(): void {
  cachedConfig = undefined
}

export function loadUserHooksConfig(): UserHooksConfig {
  if (cachedConfig !== undefined) return cachedConfig ?? { hooks: [] }
  for (const p of HOOK_PATHS) {
    if (!existsSync(p)) continue
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as UserHooksConfig
      cachedConfig = {
        hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
      }
      return cachedConfig
    } catch {
      continue
    }
  }
  cachedConfig = { hooks: [] }
  return cachedConfig
}

export async function runUserHooks(
  ctx: HookInvocationContext,
): Promise<{ blocked: boolean; message?: string }> {
  const config = loadUserHooksConfig()
  const entries = config.hooks.filter((h) => h.event === ctx.event && h.command?.trim())
  if (entries.length === 0) return { blocked: false }

  const payload = JSON.stringify(ctx)
  for (const entry of entries) {
    try {
      const { stderr } = await execFileAsync(
        entry.command,
        [...(entry.args ?? []), payload],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      )
      if (stderr?.trim() && ctx.event === 'beforeToolCall') {
        return { blocked: true, message: stderr.trim() }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (ctx.event === 'beforeToolCall') {
        return { blocked: true, message: `Hook blocked: ${msg}` }
      }
    }
  }
  return { blocked: false }
}
