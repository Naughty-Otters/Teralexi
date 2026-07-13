import { createLogger } from '@main/logger'
import {
  getSandboxOutputScopeFromEnv,
  setSandboxOutputScope,
} from './tool-loop-output'
import { getSandboxRootFromEnv, getWorkspacePathFromEnv } from './paths'
import {
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  TERALEXI_AGENT_WORKSPACE_PATH_ENV,
  TERALEXI_AGENT_CONVERSATION_ID_ENV,
  TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
  CONVERSATION_ID_GLOBAL_KEY,
  ASSISTANT_MESSAGE_ID_GLOBAL_KEY,
  setAgentRunWorkspaceGlobal,
  clearAgentRunWorkspaceGlobal,
} from './run-context'

const log = createLogger('sandbox.globals-lock')

export type SandboxGlobalsBindings = {
  root?: string
  outputScope?: string
  /** User project folder — independent of sandbox, set alongside sandbox root. */
  workspacePath?: string
  /** Conversation id for plan-mode and other conversation-scoped tools. */
  conversationId?: string
  /** Assistant message id for the current turn (follow-up source binding). */
  assistantMessageId?: string
}

export type SandboxGlobalsSnapshot = {
  root?: string
  outputScope?: string
  workspacePath?: string
  conversationId?: string
  assistantMessageId?: string
}

/** Binds process globals/env for skill bundles (tests and exclusive tool runs). */
export function bindSandboxGlobalsForTools(bindings: SandboxGlobalsBindings): void {
  applySandboxGlobalsToProcess(bindings)
}

function applySandboxGlobalsToProcess(bindings: SandboxGlobalsBindings): void {
  const g = globalThis as unknown as Record<string, unknown>
  const root = bindings.root?.trim()
  if (root) {
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = root
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
  } else {
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
  }

  const outputScope = bindings.outputScope?.trim()
  if (outputScope) {
    setSandboxOutputScope(outputScope)
  } else {
    setSandboxOutputScope(undefined)
  }

  const workspacePath = bindings.workspacePath?.trim()
  if (workspacePath) {
    process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV] = workspacePath
    g[WORKSPACE_PATH_GLOBAL_KEY] = workspacePath
  } else {
    delete process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV]
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
  }

  const conversationId = bindings.conversationId?.trim()
  if (conversationId) {
    process.env[TERALEXI_AGENT_CONVERSATION_ID_ENV] = conversationId
    g[CONVERSATION_ID_GLOBAL_KEY] = conversationId
  } else {
    delete process.env[TERALEXI_AGENT_CONVERSATION_ID_ENV]
    delete g[CONVERSATION_ID_GLOBAL_KEY]
  }

  const assistantMessageId = bindings.assistantMessageId?.trim()
  if (assistantMessageId) {
    process.env[TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV] = assistantMessageId
    g[ASSISTANT_MESSAGE_ID_GLOBAL_KEY] = assistantMessageId
  } else {
    delete process.env[TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV]
    delete g[ASSISTANT_MESSAGE_ID_GLOBAL_KEY]
  }
}

export function captureSandboxGlobalsFromProcess(): SandboxGlobalsSnapshot {
  const g = globalThis as unknown as Record<string, unknown>
  const fromGlobalConv = g[CONVERSATION_ID_GLOBAL_KEY]
  const conversationId =
    typeof fromGlobalConv === 'string' && fromGlobalConv.trim()
      ? fromGlobalConv.trim()
      : process.env[TERALEXI_AGENT_CONVERSATION_ID_ENV]?.trim() || undefined

  const fromGlobalAsst = g[ASSISTANT_MESSAGE_ID_GLOBAL_KEY]
  const assistantMessageId =
    typeof fromGlobalAsst === 'string' && fromGlobalAsst.trim()
      ? fromGlobalAsst.trim()
      : process.env[TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV]?.trim() || undefined

  return {
    root: getSandboxRootFromEnv(),
    outputScope: getSandboxOutputScopeFromEnv(),
    workspacePath: getWorkspacePathFromEnv() ?? undefined,
    conversationId,
    assistantMessageId,
  }
}

export function restoreSandboxGlobalsOnProcess(snapshot: SandboxGlobalsSnapshot): void {
  applySandboxGlobalsToProcess(snapshot)
}

let lockTail: Promise<void> = Promise.resolve()

/** @internal Test helper — clears a stuck lock chain after deadlock regression tests. */
export function resetSandboxGlobalsLockForTests(): void {
  lockTail = Promise.resolve()
}

/**
 * Runs `fn` while this process's sandbox globals match `bindings`.
 * Concurrent callers are serialized so skill bundles never read another run's paths.
 */
export async function runWithExclusiveSandboxGlobals<T>(
  resolveBindings: () => SandboxGlobalsBindings,
  fn: () => Promise<T>,
): Promise<T> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  const previousTail = lockTail
  lockTail = previousTail
    .then(() => gate)
    .catch(() => gate)

  await previousTail

  const previousGlobals = captureSandboxGlobalsFromProcess()
  applySandboxGlobalsToProcess(resolveBindings())

  try {
    return await fn()
  } catch (err) {
    log.debug('Sandbox globals exclusive run failed', { err })
    throw err
  } finally {
    restoreSandboxGlobalsOnProcess(previousGlobals)
    release()
  }
}
