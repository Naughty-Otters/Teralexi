import {
  createUIMessageStream,
  type ChatTransport,
  type FinishReason,
  type IdGenerator,
  type UIMessage,
  type UIMessageChunk,
} from '@teralexi-ai'
import { randomShortUuid } from '@shared/utils/short-uuid'
import {
  AGENT_ERROR_TEXT_PREFIX,
  isAgentErrorText,
  isLlmErrorProgressText,
} from '@shared/agent/llm-error-ui'

import { DEFAULT_USER_ID } from '../../store/modules/agent/config'
import { createLogger } from '@renderer/utils/logger'
import { recordIngressChunk } from './perf/chatUiPerf'
import {
  flushAllUiForConversation,
  recordIngressChunkForBackpressure,
} from './perf/scheduleUiFlush'

const transportLog = createLogger('agent.chat.transport')

/** Context resolved when a send runs. */
export type IpcAgentRunContext = {
  conversationId: string
  agentId: string
  userId: string
}

export type IpcAgentChatTransportOptions = {
  getRunContext: () => IpcAgentRunContext | null
  persistUserMessage: (args: {
    id: string
    conversationId: string
    agentId: string
    content: string
  }) => void | Promise<void>
  /** Override the default RunAgentForConversation IPC invoke. */
    invokeRunAgent?: (args: {
    conversationId: string
    agentId: string
    assistantMessageId: string
    userId: string
    uiMessages: unknown[]
    bodyExtras?: Record<string, unknown>
    pendingUserMessage?: {
      id: string
      content: string
      createdAt: string
    }
    attachmentSourcePaths?: string[]
  }) => Promise<{
    finalContent: string
    hasError: boolean
    errorMessage?: string
    hitlPaused?: boolean
  }>
  /** Fired when an IPC-backed UI stream starts / ends for a conversation. */
  onStreamLifecycle?: (conversationId: string, phase: 'start' | 'end') => void
  /** Fired after each UI chunk is written (use to snapshot live messages). */
  onStreamUiChunk?: (
    conversationId: string,
    meta?: { immediate?: boolean },
  ) => void
  /** Block dequeuing queued user messages until HITL form/approval is resolved. */
  onHitlBlocksQueue?: (conversationId: string, blocked: boolean) => void
}

function getLastUser(messages: readonly UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i]
  }
  return undefined
}

function messageText(user: UIMessage): string {
  let t = ''
  for (const p of user.parts) {
    if (p.type === 'text' && typeof p.text === 'string') t += p.text
  }
  return t
}

function readAttachmentSourcePaths(
  bodyExtras: Record<string, unknown>,
): string[] {
  const raw = bodyExtras.attachmentSourcePaths
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (path): path is string => typeof path === 'string' && path.trim().length > 0,
  )
}

/** Persistable summary when the user row is only HITL form submit (no plain text). */
function collectFormResponsePersistText(user: UIMessage): string {
  for (const p of user.parts) {
    if ((p as { type?: string }).type !== 'data-collect-form-response') continue
    const rid =
      typeof (p as { id?: string }).id === 'string'
        ? (p as { id: string }).id.trim()
        : ''
    const data = (p as { data?: unknown }).data
    let line = `[data-collect-form-response${rid ? `:${rid}` : ''}]`
    if (data && typeof data === 'object') {
      try {
        line += `\n${JSON.stringify(data)}`
      } catch {
        /* ignore */
      }
    }
    return line
  }
  return ''
}

function serializeUiMessages(messages: readonly UIMessage[]): unknown[] {
  try {
    return JSON.parse(JSON.stringify(messages)) as unknown[]
  } catch {
    return messages.map((message) => {
      try {
        return JSON.parse(JSON.stringify(message)) as unknown
      } catch {
        return {
          id: String(message.id),
          role: message.role,
          parts: message.parts.map((part) => {
            try {
              return JSON.parse(JSON.stringify(part)) as unknown
            } catch {
              const type =
                typeof (part as { type?: string }).type === 'string'
                  ? (part as { type: string }).type
                  : 'text'
              const text =
                typeof (part as { text?: string }).text === 'string'
                  ? (part as { text: string }).text
                  : ''
              return { type, text }
            }
          }),
        }
      }
    })
  }
}

/**
 * AI SDK {@link AbstractChat} passes `messageId` on `submit-message` when continuing the
 * same assistant row (e.g. after tool approval auto-send). The UI stream `start` chunk
 * must use that id so the client replaces the last assistant message instead of appending.
 *
 * @see https://github.com/vercel/ai/blob/main/packages/ai/src/ui/chat.ts — `makeRequest` /
 * `replaceLastMessage` vs `pushMessage`.
 */
function resolveAssistantStreamMessageId(
  trigger: 'submit-message' | 'regenerate-message',
  messageId: string | undefined,
  messages: readonly UIMessage[],
): string {
  const trimmed = messageId?.trim()
  const last = messages[messages.length - 1]

  if (trigger === 'regenerate-message') {
    if (trimmed) return trimmed
    if (last?.role === 'assistant') return last.id
    return randomShortUuid()
  }

  // submit-message: new assistant turn ends with a user message.
  // Continuations (tool approval auto-send, empty follow-up) end with assistant — reuse that id.
  if (trigger === 'submit-message') {
    if (trimmed && last?.role === 'assistant' && trimmed === last.id) {
      return trimmed
    }
    if (!trimmed && last?.role === 'assistant') {
      return last.id
    }
  }

  return randomShortUuid()
}

/**
 * Last value returned by {@link createRendererChatGenerateId}. Updated on every Chat
 * `generateId()` call (user row, then assistant stream id for a normal send).
 */
let lastSdkGeneratedMessageId: string | undefined

/**
 * Pass as `new Chat({ generateId: createRendererChatGenerateId(), ... })` so
 * {@link IpcAgentChatTransport} can reuse the same id AbstractChat assigned to the
 * streaming assistant (avoids a second UUID / nanoid and duplicate logical rows).
 */
export function createRendererChatGenerateId(): IdGenerator {
  return () => {
    const id = randomShortUuid()
    lastSdkGeneratedMessageId = id
    return id
  }
}

/**
 * When the request ends with a **user** message, `AbstractChat` has already called
 * `generateId()` for the new assistant row — that id must match IPC + `start` chunk.
 * When it ends with **assistant** (HITL continuation), use {@link resolveAssistantStreamMessageId}
 * instead; the SDK still invokes an extra `generateId()` internally which we ignore.
 */
function pickAssistantStreamMessageId(
  trigger: 'submit-message' | 'regenerate-message',
  messageId: string | undefined,
  messages: readonly UIMessage[],
): string {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant') {
    return resolveAssistantStreamMessageId(trigger, messageId, messages)
  }
  // Form submit: user message follows the assistant row that holds the form request.
  // Reuse that assistant id so pending execution (conversationId:assistantMessageId) resolves.
  if (last?.role === 'user' && messages.length >= 2) {
    const hasFormResponse = last.parts.some(
      (p) => (p as { type?: string }).type === 'data-collect-form-response',
    )
    if (hasFormResponse) {
      const prev = messages[messages.length - 2]
      if (prev?.role === 'assistant') return prev.id
    }
  }
  const fromSdk = lastSdkGeneratedMessageId
  if (fromSdk) return fromSdk
  return resolveAssistantStreamMessageId(trigger, messageId, messages)
}

/**
 * Merges legacy string chunks (`AgentStreamChunk`) and AI SDK UI chunks
 * (`AgentUIMessageChunk`) from main-process tool loops into one {@link UIMessageChunk} stream.
 */
function createIpcUIMessageReadableStream(opts: {
  assistantMessageId: string
  conversationId: string
  abortSignal: AbortSignal | undefined
  textPartId: string
  onStreamLifecycle?: (conversationId: string, phase: 'start' | 'end') => void
  onStreamUiChunk?: (
    conversationId: string,
    meta?: { immediate?: boolean },
  ) => void
  onHitlBlocksQueue?: (conversationId: string, blocked: boolean) => void
  invokeRunAgent: () => Promise<{
    finalContent: string
    hasError: boolean
    errorMessage?: string
    hitlPaused?: boolean
  }>
}): ReadableStream<UIMessageChunk> {
  const { readable, writable } = new TransformStream<
    UIMessageChunk,
    UIMessageChunk
  >()
  const writer = writable.getWriter()
  let finished = false
  let preferUiChunks = false
  /**
   * After the first UI chunk, ignore legacy `AgentStreamChunk` strings.
   * Tool-loop text is forwarded as `text-delta` UI chunks; legacy strings would duplicate.
   */
  let legacyTextStartSent = false
  let sawCollectFormRequestChunk = false
  let sawToolApprovalRequestChunk = false

  const ipc = window.ipcRendererChannel

  function ensureLegacyTextStart() {
    if (legacyTextStartSent || preferUiChunks) return
    legacyTextStartSent = true
    void writer.write({ type: 'text-start', id: opts.textPartId })
  }

  const listenerUiChunk = (
    _event: unknown,
    payload: {
      conversationId: string
      assistantId: string
      chunk: Record<string, unknown>
    },
  ) => {
    if (finished || payload.conversationId !== opts.conversationId) return
    if (payload.assistantId !== opts.assistantMessageId) return
    preferUiChunks = true
    const rawChunk = payload.chunk as Record<string, unknown>
    if (rawChunk.type === 'data-collect-form-request') {
      sawCollectFormRequestChunk = true
      opts.onHitlBlocksQueue?.(payload.conversationId, true)
    }
    if (rawChunk.type === 'tool-approval-request') {
      sawToolApprovalRequestChunk = true
      opts.onHitlBlocksQueue?.(payload.conversationId, true)
    }
    const chunk = rawChunk as UIMessageChunk
    if (chunk.type === 'text-delta') ensureLegacyTextStart()
    if (rawChunk.type === 'data-agent-step-progress') {
      const data = rawChunk.data as
        | { content?: string; summary?: string; stepId?: string }
        | undefined
      const progressContent =
        typeof data?.content === 'string' ? data.content : ''
      const progressSummary =
        typeof data?.summary === 'string' ? data.summary : ''
      if (
        isLlmErrorProgressText(progressContent) ||
        isLlmErrorProgressText(progressSummary) ||
        isAgentErrorText(progressContent) ||
        isAgentErrorText(progressSummary)
      ) {
        transportLog.error('LLM/agent error step progress received', {
          conversationId: payload.conversationId,
          assistantMessageId: payload.assistantId,
          stepId: data?.stepId,
          content: (progressContent || progressSummary).trim().slice(0, 500),
        })
      }
    }
    const immediate =
      rawChunk.type === 'tool-approval-request' ||
      rawChunk.type === 'data-collect-form-request'
    void writer.write(chunk).then(() => {
      recordIngressChunk()
      recordIngressChunkForBackpressure(payload.conversationId)
      opts.onStreamUiChunk?.(payload.conversationId, { immediate })
    })
  }

  function writeLiveErrorStepProgress(content: string): void {
    const trimmed = content.trim()
    if (!trimmed) return
    transportLog.error('LLM/agent error received in chat stream', {
      conversationId: opts.conversationId,
      assistantMessageId: opts.assistantMessageId,
      content: trimmed.slice(0, 500),
    })
    void writer
      .write({
        type: 'data-agent-step-progress',
        id: `${opts.assistantMessageId}-live-error`,
        data: {
          stepKey: `${opts.assistantMessageId}-live-error`,
          stepId: 'llmError',
          title: isAgentErrorText(trimmed) ? 'Agent error' : 'LLM error',
          content: trimmed,
          status: 'completed',
          sequence: 999_999,
        },
      } as UIMessageChunk)
      .then(() => {
        recordIngressChunk()
        recordIngressChunkForBackpressure(opts.conversationId)
        opts.onStreamUiChunk?.(opts.conversationId, { immediate: true })
      })
  }

  const listenerStringChunk = (
    _event: unknown,
    payload: { conversationId: string; assistantId: string; chunk: string },
  ) => {
    if (finished || payload.conversationId !== opts.conversationId) return
    if (payload.assistantId !== opts.assistantMessageId) return
    if (preferUiChunks) {
      if (
        !isLlmErrorProgressText(payload.chunk) &&
        !isAgentErrorText(payload.chunk)
      ) {
        return
      }
      writeLiveErrorStepProgress(payload.chunk)
      return
    }
    ensureLegacyTextStart()
    void writer
      .write({
        type: 'text-delta',
        id: opts.textPartId,
        delta: payload.chunk,
      })
      .then(() => {
        recordIngressChunk()
        recordIngressChunkForBackpressure(payload.conversationId)
        opts.onStreamUiChunk?.(payload.conversationId)
      })
  }

  ipc?.AgentUIMessageChunk?.on?.(
    listenerUiChunk as (...args: unknown[]) => void,
  )
  ipc?.AgentStreamChunk?.on?.(
    listenerStringChunk as (...args: unknown[]) => void,
  )

  async function cleanupListeners() {
    ipc?.AgentUIMessageChunk?.removeListener?.(
      listenerUiChunk as (...args: unknown[]) => void,
    )
    ipc?.AgentStreamChunk?.removeListener?.(
      listenerStringChunk as (...args: unknown[]) => void,
    )
  }

  function releaseHitlQueueBlockIfIdle() {
    if (!sawCollectFormRequestChunk && !sawToolApprovalRequestChunk) {
      opts.onHitlBlocksQueue?.(opts.conversationId, false)
    }
  }

  async function finishOk() {
    if (finished) return
    finished = true
    flushAllUiForConversation(opts.conversationId)
    opts.onStreamLifecycle?.(opts.conversationId, 'end')
    releaseHitlQueueBlockIfIdle()
    await cleanupListeners()
    if (legacyTextStartSent) {
      await writer
        .write({ type: 'text-end', id: opts.textPartId })
        .catch(() => {})
    }
    await writer
      .write({ type: 'finish', finishReason: 'stop' as FinishReason })
      .catch(() => {})
    await writer.close().catch(() => {})
  }

  async function injectFinalText(finalContent: string) {
    const trimmed = finalContent.trim()
    if (
      !trimmed ||
      legacyTextStartSent ||
      sawToolApprovalRequestChunk ||
      sawCollectFormRequestChunk
    ) {
      return
    }
    legacyTextStartSent = true
    await writer
      .write({ type: 'text-start', id: opts.textPartId })
      .catch(() => {})
    await writer
      .write({
        type: 'text-delta',
        id: opts.textPartId,
        delta: finalContent,
      })
      .catch(() => {})
  }

  async function finishError(text: string) {
    if (finished) return
    finished = true
    flushAllUiForConversation(opts.conversationId)
    opts.onStreamLifecycle?.(opts.conversationId, 'end')
    opts.onHitlBlocksQueue?.(opts.conversationId, false)
    await cleanupListeners()
    const message = text.trim() || 'Agent failed'
    transportLog.error('Agent run failed in chat transport', {
      conversationId: opts.conversationId,
      assistantMessageId: opts.assistantMessageId,
      errorMessage: message,
    })
    const errorPartId = `${opts.textPartId}-error`
    const body = `\n\n${AGENT_ERROR_TEXT_PREFIX} ${message}\n\n`
    await writer
      .write({
        type: 'data-agent-step-progress',
        id: `${opts.assistantMessageId}-agent-error`,
        data: {
          stepKey: `${opts.assistantMessageId}-agent-error`,
          stepId: 'llmError',
          title: 'Agent error',
          content: body.trim(),
          status: 'completed',
          sequence: 999_999,
        },
      } as UIMessageChunk)
      .catch(() => {})
    await writer.write({ type: 'text-start', id: errorPartId }).catch(() => {})
    await writer
      .write({ type: 'text-delta', id: errorPartId, delta: body })
      .catch(() => {})
    await writer.write({ type: 'text-end', id: errorPartId }).catch(() => {})
    await writer.write({ type: 'error', errorText: message }).catch(() => {})
    await writer.close().catch(() => {})
  }

  opts.abortSignal?.addEventListener(
    'abort',
    () => {
      void (async () => {
        await finishError('Aborted')
        try {
          await window.ipcRendererChannel?.StopAgentForConversation?.invoke?.({
            conversationId: opts.conversationId,
          })
        } catch {
          /* ignore */
        }
      })()
    },
    { once: true },
  )

  opts.onStreamLifecycle?.(opts.conversationId, 'start')
  ;(async () => {
    try {
      const result = await opts.invokeRunAgent()
      if (result.hasError) {
        await finishError(result.errorMessage?.trim() || 'Agent failed')
        return
      }
      if (!result.hitlPaused) {
        const finalText = result.finalContent.trim()
        if (
          finalText &&
          !legacyTextStartSent &&
          !sawToolApprovalRequestChunk &&
          !sawCollectFormRequestChunk
        ) {
          await injectFinalText(finalText)
        }
      }
      await finishOk()
    } catch (e) {
      await finishError(e instanceof Error ? e.message : String(e))
    }
  })()

  return readable
}

/**
 * [`ChatTransport`](https://github.com/vercel/ai/blob/main/packages/ai/src/ui/chat-transport.ts)
 * bridged to `RunAgentForConversation` plus streaming IPC from the main-process agent.
 *
 * **Live UI authority:** for the visible conversation, the Chat SDK `messagesRef`
 * updated by this transport is the source of truth during a stream. Pinia store
 * rows sync in the background (see `storeStreamSync` + `AgentChat.vue` IPC).
 *
 * Human-in-the-loop: tool-loop runs emit {@link UIMessageChunk}s (including
 * `tool-approval-request`) over `AgentUIMessageChunk`; legacy steps still use `AgentStreamChunk` strings.
 *
 * @see https://ai-sdk.dev/cookbook/next/human-in-the-loop
 */
export class IpcAgentChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly options: IpcAgentChatTransportOptions) {}

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }

  async sendMessages({
    chatId: _chatId,
    trigger,
    messageId,
    messages,
    abortSignal,
    body,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    const ctx = this.options.getRunContext()
    if (!ctx) throw new Error('No active agent conversation')

    const assistantMessageId = pickAssistantStreamMessageId(
      trigger,
      messageId,
      messages,
    )

    const bodyExtras =
      body && typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {}

    const textPartId = 'text-main'

    const lastUser = getLastUser(messages)
    const userText = lastUser ? messageText(lastUser).trim() : ''
    const formPersistText = lastUser
      ? collectFormResponsePersistText(lastUser)
      : ''
    const userPersistContent = userText || formPersistText.trim()
    if (
      lastUser &&
      userPersistContent.length > 0 &&
      trigger === 'submit-message' &&
      messages.length > 0 &&
      messages[messages.length - 1]?.role === 'user'
    ) {
      await Promise.resolve(
        this.options.persistUserMessage({
          id: lastUser.id,
          conversationId: ctx.conversationId,
          agentId: ctx.agentId,
          content: userPersistContent,
        }),
      )
    }

    const userId =
      typeof bodyExtras.userId === 'string' &&
      bodyExtras.userId.trim().length > 0
        ? (bodyExtras.userId as string)
        : ctx.userId || DEFAULT_USER_ID

    const uiMessagesPayload = serializeUiMessages(messages)

    const pendingUserMessage =
      lastUser &&
      userPersistContent.length > 0 &&
      trigger === 'submit-message'
        ? {
            id: String(lastUser.id),
            content: String(userPersistContent),
            createdAt:
              typeof (lastUser as { createdAt?: string }).createdAt === 'string'
                ? String((lastUser as { createdAt: string }).createdAt)
                : new Date().toISOString(),
          }
        : undefined

    const subAgentMention =
      bodyExtras.subAgentMention &&
      typeof bodyExtras.subAgentMention === 'object' &&
      bodyExtras.subAgentMention !== null
        ? (bodyExtras.subAgentMention as {
            targetAgentId?: string
            task?: string
          })
        : null
    const subAgentTargetId = subAgentMention?.targetAgentId?.trim() ?? ''
    const subAgentTask = subAgentMention?.task?.trim() ?? ''

    // Same id everywhere: Chat.generateId, IPC routing, and UI stream chunks.
    // `handleUIMessageStreamFinish` also calls generateId once unless we override it here
    // (defaults to nanoid-style ids from @ai-sdk/provider-utils).
    const stableAssistantId = () => assistantMessageId

    // Always pass history so `handleUIMessageStreamFinish` can align continuation
    // (last assistant id, metadata) with the UI stream — same as HTTP transport.
    return createUIMessageStream<UIMessage>({
      originalMessages: [...messages],
      generateId: stableAssistantId,
      execute: async ({ writer }) => {
        writer.write({ type: 'start', messageId: assistantMessageId })

        const inner = createIpcUIMessageReadableStream({
          assistantMessageId,
          conversationId: ctx.conversationId,
          abortSignal,
          textPartId,
          onStreamLifecycle: this.options.onStreamLifecycle,
          onStreamUiChunk: this.options.onStreamUiChunk,
          onHitlBlocksQueue: this.options.onHitlBlocksQueue,
          invokeRunAgent: async () => {
            const attachmentSourcePaths = readAttachmentSourcePaths(bodyExtras)

            if (subAgentTargetId && subAgentTask) {
              const invoke =
                window.ipcRendererChannel?.RunSubAgentMention?.invoke
              if (!invoke)
                throw new Error('RunSubAgentMention IPC not available')
              return invoke({
                conversationId: ctx.conversationId,
                agentId: ctx.agentId,
                assistantMessageId,
                userId,
                targetAgentId: subAgentTargetId,
                task: subAgentTask,
                uiMessages: uiMessagesPayload,
                pendingUserMessage,
                attachmentSourcePaths,
              })
            }
            if (this.options.invokeRunAgent) {
              return this.options.invokeRunAgent({
                conversationId: ctx.conversationId,
                agentId: ctx.agentId,
                assistantMessageId,
                userId,
                uiMessages: uiMessagesPayload,
                bodyExtras,
                pendingUserMessage,
                attachmentSourcePaths,
              })
            }
            const invoke =
              window.ipcRendererChannel?.RunAgentForConversation?.invoke
            if (!invoke)
              throw new Error('RunAgentForConversation IPC not available')
            return invoke({
              conversationId: ctx.conversationId,
              agentId: ctx.agentId,
              assistantMessageId,
              userId,
              uiMessages: uiMessagesPayload,
              pendingUserMessage,
              attachmentSourcePaths,
            })
          },
        })

        const reader = inner.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          // Main-process `toUIMessageStream()` often emits its own `start` with the SDK
          // default message id — a second `start` overwrites the assistant id in the client.
          if (value.type === 'start') {
            writer.write({
              ...value,
              messageId: assistantMessageId,
            })
            continue
          }
          writer.write(value)
        }
      },
    })
  }
}
