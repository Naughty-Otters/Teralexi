import { createHash } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getopenfdeSandboxDir } from '@config/openfde-home'
import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import {
  LLM_DEBUG_MODE_PROPERTY_KEY,
  parseLlmDebugMode,
} from '@shared/agent/llm-debug'
import { randomShortId } from '../run/flow-scoped-ids'
import {
  buildContextAfter,
  buildContextBefore,
  type LlmDebugContextSnapshot,
} from './llm-debug-context'
import type { LlmDebugToolCallRecord } from './llm-debug-tool-calls'
import type { LlmDebugRuntimeSnapshot } from './llm-debug-runtime-context'

const log = createLogger('agent.llm.debug')

export type LlmDebugContext = {
  userId?: string
  conversationId?: string
  agentId?: string
  llmDebugRunId?: string
  stepId?: string | null
  /** Agent class snapshot at LLM call start. */
  runtimeSnapshot?: LlmDebugRuntimeSnapshot
  /** Re-capture runtime classes after the LLM call (flow/step state may have changed). */
  refreshRuntimeSnapshot?: () => LlmDebugRuntimeSnapshot | undefined
}

export type LlmDebugRequestRecord = LlmDebugContext & {
  callId: string
  timestamp: string
  callKind: 'streamText' | 'agentStream'
  label?: string
  model?: string
  instructions?: string
  toolNames: string[]
  messages: unknown[]
}

export type LlmDebugResponseRecord = {
  text: string
  structuredOutput?: unknown
  toolCalls?: LlmDebugToolCallRecord[]
  instructions?: string
  messagesBefore?: unknown[]
  runtimeSnapshotAfter?: LlmDebugRuntimeSnapshot
}

const enabledCache = new Map<string, boolean>()
const sessionCounters = new Map<string, number>()

export function invalidateLlmDebugCache(userId?: string): void {
  if (userId?.trim()) {
    enabledCache.delete(userId.trim())
    return
  }
  enabledCache.clear()
}

export function isLlmDebugEnabled(userId: string | undefined): boolean {
  const id = userId?.trim()
  if (!id) return false
  const cached = enabledCache.get(id)
  if (cached !== undefined) return cached
  try {
    const row = getConversationStore().getUserProperty(
      id,
      LLM_DEBUG_MODE_PROPERTY_KEY,
    )
    const enabled = parseLlmDebugMode(row?.propertyValue)
    enabledCache.set(id, enabled)
    return enabled
  } catch {
    return false
  }
}

function sandboxRootForConversation(conversationId: string): string {
  const dirName = createHash('sha256')
    .update(conversationId, 'utf8')
    .digest('hex')
  return join(getopenfdeSandboxDir(), dirName)
}

export function resolveLlmDebugRunDir(ctx: LlmDebugContext): string | null {
  const runId = ctx.llmDebugRunId?.trim()
  if (!runId) return null
  const conversationId = ctx.conversationId?.trim()
  const root = conversationId
    ? sandboxRootForConversation(conversationId)
    : join(getopenfdeSandboxDir(), '_ephemeral', runId)
  return join(root, 'llm-debug', runId)
}

function sessionKey(ctx: LlmDebugContext): string | null {
  const runId = ctx.llmDebugRunId?.trim()
  if (!runId) return null
  const conversationId = ctx.conversationId?.trim() ?? '_ephemeral'
  return `${conversationId}:${runId}`
}

function nextCallId(ctx: LlmDebugContext): string | null {
  const key = sessionKey(ctx)
  if (!key) return null
  const next = (sessionCounters.get(key) ?? 0) + 1
  sessionCounters.set(key, next)
  return String(next).padStart(3, '0')
}

export function createLlmDebugRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${stamp}-${randomShortId(4)}`
}

function slugifyAgentIdForDebug(agentId: string): string {
  const slug = agentId
    .replace(/^skill:/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 24)
  return slug || 'agent'
}

/** Child run id under the same conversation sandbox when parent already has a debug session. */
export function createSubAgentLlmDebugRunId(
  parentRunId: string | undefined,
  childAgentId: string,
  userId: string | undefined,
): string | undefined {
  const trimmedParent = parentRunId?.trim()
  if (trimmedParent) {
    return `${trimmedParent}__sub__${slugifyAgentIdForDebug(childAgentId)}__${randomShortId(4)}`
  }
  if (!isLlmDebugEnabled(userId)) return undefined
  return `sub__${slugifyAgentIdForDebug(childAgentId)}__${createLlmDebugRunId()}`
}

function serializeModel(model: unknown): string | undefined {
  if (model == null) return undefined
  if (typeof model === 'string') return model
  if (typeof model === 'object') {
    const m = model as { modelId?: unknown; provider?: unknown }
    if (m.modelId != null) return String(m.modelId)
    if (m.provider != null) return String(m.provider)
  }
  return String(model)
}

export function extractToolNames(tools: unknown): string[] {
  if (!tools || typeof tools !== 'object') return []
  return Object.keys(tools as Record<string, unknown>).sort()
}

function safeJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (v instanceof Error) {
        return { name: v.name, message: v.message }
      }
      return v
    },
    2,
  )
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp`
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, filePath)
}

function scheduleWrite(task: () => Promise<void>): void {
  void task().catch((err) => {
    log.warn('LLM debug write failed', { err })
  })
}

export function scheduleLlmDebugRequest(
  ctx: LlmDebugContext,
  record: Omit<LlmDebugRequestRecord, 'callId' | 'timestamp'>,
  options?: { runtimeSnapshot?: LlmDebugRuntimeSnapshot },
): string | null {
  if (!isLlmDebugEnabled(ctx.userId)) return null
  const callId = nextCallId(ctx)
  if (!callId) return null
  const dir = resolveLlmDebugRunDir(ctx)
  if (!dir) return null

  const payload: LlmDebugRequestRecord = {
    ...ctx,
    ...record,
    callId,
    timestamp: new Date().toISOString(),
  }

  const base = `${callId}-${record.callKind}${record.label ? `-${sanitizeLabel(record.label)}` : ''}`
  const contextBefore = buildContextBefore({
    instructions: record.instructions,
    messages: record.messages,
    runtime: options?.runtimeSnapshot ?? ctx.runtimeSnapshot,
  })
  scheduleWrite(async () => {
    await writeAtomic(join(dir, `${base}.request.json`), safeJson(payload))
    await writeAtomic(
      join(dir, `${base}.context-before.json`),
      safeJson(contextBefore),
    )
  })
  return callId
}

export function scheduleLlmDebugResponse(
  ctx: LlmDebugContext,
  callId: string,
  record: LlmDebugResponseRecord,
  meta: { callKind: 'streamText' | 'agentStream'; label?: string },
): void {
  if (!isLlmDebugEnabled(ctx.userId)) return
  const dir = resolveLlmDebugRunDir(ctx)
  if (!dir) return

  const base = `${callId}-${meta.callKind}${meta.label ? `-${sanitizeLabel(meta.label)}` : ''}`
  const contextAfter = buildContextAfter({
    instructions: record.instructions,
    messagesBefore: record.messagesBefore ?? [],
    assistantText: record.text,
    toolCalls: record.toolCalls,
    structuredOutput: record.structuredOutput,
    runtime: record.runtimeSnapshotAfter,
  })
  scheduleWrite(async () => {
    await writeAtomic(join(dir, `${base}.response.txt`), record.text)
    await writeAtomic(
      join(dir, `${base}.context-after.json`),
      safeJson(contextAfter),
    )
    if (record.structuredOutput !== undefined) {
      await writeAtomic(
        join(dir, `${base}.response.json`),
        safeJson(record.structuredOutput),
      )
    }
    if (record.toolCalls && record.toolCalls.length > 0) {
      await writeAtomic(
        join(dir, `${base}.tool-calls.json`),
        safeJson(record.toolCalls),
      )
    }
  })
}

export type { LlmDebugContextSnapshot }

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48)
}

export function buildStreamTextDebugRequest(
  ctx: LlmDebugContext,
  streamParams: {
    model?: unknown
    instructions?: unknown
    system?: unknown
    messages?: unknown
    tools?: unknown
  },
  label?: string,
): Omit<LlmDebugRequestRecord, 'callId' | 'timestamp'> {
  const instructions =
    typeof streamParams.instructions === 'string'
      ? streamParams.instructions
      : typeof streamParams.system === 'string'
        ? streamParams.system
        : undefined
  return {
    ...ctx,
    callKind: 'streamText',
    label,
    model: serializeModel(streamParams.model),
    instructions,
    toolNames: extractToolNames(streamParams.tools),
    messages: Array.isArray(streamParams.messages) ? streamParams.messages : [],
  }
}
