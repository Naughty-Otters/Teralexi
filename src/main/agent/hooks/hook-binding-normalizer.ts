import type {
  ConversationHookEntry,
} from '@shared/agent/conversation-hooks'
import type {
  HookBindingSource,
  HookEvent,
  HookHandler,
  RunnableAgentHookBinding,
  RunnableCommandHookBinding,
  RunnableFunctionHookBinding,
  RunnableFunctionRefHookBinding,
  RunnableHookBinding,
  RunnablePromptHookBinding,
} from '@shared/agent/hooks'
import type { HookBinding } from '@teralexi/skill-sdk'
import { normalizeHookEvent } from './hook-event-aliases'

export type FlatHookEntry = {
  event: string
  command?: string
  args?: string[]
  type?: string
  timeout?: number
  module?: string
  export?: string
  prompt?: string
  model?: string
  agentId?: string
  enabled?: boolean
  id?: string
}

function isHookHandler(value: unknown): value is HookHandler {
  return typeof value === 'function'
}

function bindingEnabled(raw: FlatHookEntry | HookBinding): boolean {
  return !('enabled' in raw && raw.enabled === false)
}

function normalizeCommandBinding(
  event: HookEvent,
  raw: FlatHookEntry | HookBinding,
  source: HookBindingSource,
  extensionId?: string,
  trustKey?: string,
): RunnableCommandHookBinding | null {
  const type = 'type' in raw && raw.type ? raw.type : 'command'
  if (type !== 'command') return null

  const command =
    'command' in raw && typeof raw.command === 'string' ? raw.command.trim() : ''
  if (!command) return null

  return {
    type: 'command',
    event,
    command,
    args: 'args' in raw && Array.isArray(raw.args) ? raw.args.map(String) : undefined,
    timeout:
      'timeout' in raw && typeof raw.timeout === 'number' ? raw.timeout : undefined,
    source,
    extensionId,
    trustKey,
    enabled: bindingEnabled(raw),
    id: 'id' in raw && typeof raw.id === 'string' ? raw.id : undefined,
  }
}

function normalizeFunctionRefBinding(
  event: HookEvent,
  raw: FlatHookEntry | HookBinding,
  source: HookBindingSource,
  extensionId?: string,
  trustKey?: string,
): RunnableFunctionRefHookBinding | null {
  const type = 'type' in raw && raw.type ? raw.type : undefined
  if (type !== 'function') return null
  const modulePath =
    'module' in raw && typeof raw.module === 'string' ? raw.module.trim() : ''
  const exportName =
    'export' in raw && typeof raw.export === 'string' ? raw.export.trim() : ''
  if (!modulePath || !exportName) return null
  return {
    type: 'function-ref',
    event,
    module: modulePath,
    export: exportName,
    source,
    extensionId,
    trustKey,
    enabled: bindingEnabled(raw),
  }
}

function normalizePromptBinding(
  event: HookEvent,
  raw: FlatHookEntry | HookBinding,
  source: HookBindingSource,
  extensionId?: string,
  trustKey?: string,
): RunnablePromptHookBinding | null {
  const type = 'type' in raw && raw.type ? raw.type : undefined
  if (type !== 'prompt') return null
  const prompt =
    'prompt' in raw && typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return null
  return {
    type: 'prompt',
    event,
    prompt,
    model: 'model' in raw && typeof raw.model === 'string' ? raw.model : undefined,
    source,
    extensionId,
    trustKey,
    enabled: bindingEnabled(raw),
  }
}

function normalizeAgentBinding(
  event: HookEvent,
  raw: FlatHookEntry | HookBinding,
  source: HookBindingSource,
  extensionId?: string,
  trustKey?: string,
): RunnableAgentHookBinding | null {
  const type = 'type' in raw && raw.type ? raw.type : undefined
  if (type !== 'agent') return null
  const agentId =
    'agentId' in raw && typeof raw.agentId === 'string' ? raw.agentId.trim() : ''
  if (!agentId) return null
  return {
    type: 'agent',
    event,
    agentId,
    source,
    extensionId,
    trustKey,
    enabled: bindingEnabled(raw),
  }
}

function normalizeDataBinding(
  event: HookEvent,
  raw: FlatHookEntry | HookBinding,
  source: HookBindingSource,
  extensionId?: string,
  trustKey?: string,
): RunnableHookBinding | null {
  const type = 'type' in raw && raw.type ? raw.type : 'command'
  switch (type) {
    case 'command':
      return normalizeCommandBinding(event, raw, source, extensionId, trustKey)
    case 'function':
      return normalizeFunctionRefBinding(event, raw, source, extensionId, trustKey)
    case 'prompt':
      return normalizePromptBinding(event, raw, source, extensionId, trustKey)
    case 'agent':
      return normalizeAgentBinding(event, raw, source, extensionId, trustKey)
    default:
      return null
  }
}

function normalizeFunctionBinding(
  event: HookEvent,
  handler: HookHandler,
  source: HookBindingSource,
  extensionId?: string,
  trustKey?: string,
): RunnableFunctionHookBinding {
  return {
    type: 'function',
    event,
    handler,
    source,
    extensionId,
    trustKey,
    enabled: true,
  }
}

/** Flat `hooks.json` array: `{ hooks: [{ event, command, args? }] }`. */
export function normalizeFlatHooksFile(
  raw: unknown,
  source: HookBindingSource,
  extensionId?: string,
  trustKeyPrefix?: string,
): RunnableHookBinding[] {
  if (!raw || typeof raw !== 'object') return []
  const hooksRaw = (raw as { hooks?: unknown }).hooks
  if (!Array.isArray(hooksRaw)) return []
  const out: RunnableHookBinding[] = []
  for (const item of hooksRaw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as FlatHookEntry
    const event = normalizeHookEvent(String(entry.event ?? ''))
    if (!event) continue
    const trustKey = trustKeyPrefix ? `${trustKeyPrefix}:${event}` : undefined
    const binding = normalizeDataBinding(event, entry, source, extensionId, trustKey)
    if (binding) out.push(binding)
  }
  return out
}

/** Extension `hooks/hooks.json` map: `{ hooks: { [event]: HookBinding[] } }`. */
export function normalizeHooksMap(
  hooksMap: Record<string, unknown>,
  source: HookBindingSource,
  extensionId?: string,
  trustKeyPrefix?: string,
): RunnableHookBinding[] {
  const out: RunnableHookBinding[] = []
  for (const [rawEvent, bindings] of Object.entries(hooksMap)) {
    const event = normalizeHookEvent(rawEvent)
    if (!event || !Array.isArray(bindings)) continue
    for (const raw of bindings) {
      if (!raw || typeof raw !== 'object') continue
      const trustKey = trustKeyPrefix ? `${trustKeyPrefix}:${event}` : undefined
      const binding = normalizeDataBinding(
        event,
        raw as HookBinding,
        source,
        extensionId,
        trustKey,
      )
      if (binding) out.push(binding)
    }
  }
  return out
}

export function normalizeExtensionHooksFile(
  raw: unknown,
  source: HookBindingSource,
  extensionId?: string,
  trustKeyPrefix?: string,
): RunnableHookBinding[] {
  if (!raw || typeof raw !== 'object') return []
  const hooksRaw = (raw as { hooks?: unknown }).hooks
  if (Array.isArray(hooksRaw)) {
    return normalizeFlatHooksFile(raw, source, extensionId, trustKeyPrefix)
  }
  if (hooksRaw && typeof hooksRaw === 'object') {
    return normalizeHooksMap(
      hooksRaw as Record<string, unknown>,
      source,
      extensionId,
      trustKeyPrefix,
    )
  }
  return []
}

export function normalizeManifestHooks(
  hooks: Partial<Record<string, HookBinding[]>>,
  source: HookBindingSource,
  extensionId?: string,
  trustKeyPrefix?: string,
): RunnableHookBinding[] {
  return normalizeHooksMap(
    hooks as Record<string, unknown>,
    source,
    extensionId,
    trustKeyPrefix,
  )
}

export function normalizeModuleHooks(
  hooks: Partial<Record<string, HookHandler>>,
  source: HookBindingSource,
  extensionId?: string,
  trustKeyPrefix?: string,
): RunnableHookBinding[] {
  const out: RunnableHookBinding[] = []
  for (const [rawEvent, handler] of Object.entries(hooks)) {
    const event = normalizeHookEvent(rawEvent)
    if (!event || !isHookHandler(handler)) continue
    const trustKey = trustKeyPrefix ? `${trustKeyPrefix}:${event}:function` : undefined
    out.push(normalizeFunctionBinding(event, handler, source, extensionId, trustKey))
  }
  return out
}

export function normalizeConversationHooks(
  entries: ConversationHookEntry[],
): RunnableHookBinding[] {
  const out: RunnableHookBinding[] = []
  for (const entry of entries) {
    const event = normalizeHookEvent(entry.event)
    if (!event) continue
    const binding = normalizeDataBinding(event, entry, 'conversation')
    if (binding) {
      if ('id' in entry && typeof entry.id === 'string') {
        if (binding.type === 'command') binding.id = entry.id
      }
      binding.enabled = entry.enabled !== false
      out.push(binding)
    }
  }
  return out
}

export function filterBindingsForEvent(
  bindings: RunnableHookBinding[],
  event: HookEvent,
): RunnableHookBinding[] {
  return bindings.filter((b) => b.event === event && b.enabled !== false)
}
