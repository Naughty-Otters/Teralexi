/**
 * Typed client chat history (`UIMessage[]`) passed on HITL resume via
 * {@link AgentResponseOpts.clientUiMessages}. Parsing and conversion to
 * {@link ModelMessage} for tool-loop {@link Agent.stream}.
 */
import { convertToModelMessages, type ModelMessage } from '@teralexi-ai'
import { createLogger } from '@main/logger'
import {
  convertCollectFormDataUIPartToText,
  formatCollectFormResponsePersistenceLine,
  isCollectFormResponsePart,
} from '../form/ui-messages'
import {
  cloneClientUiMessages,
  type ClientUiMessage,
} from './client-ui-parse'
import { sanitizeMessages } from './message-sanitizer'
import {
  validateClientUiMessagesForLlm,
  validateModelMessagesForLlm,
} from '../llm/validate-llm-payload'

const log = createLogger('agent.utils.client-ui-messages')

/**
 * Run {@link sanitizeMessages} and log when mutations occur.
 * Use for any {@link ModelMessage}[] sent to tool-loop {@link Agent.stream}.
 */
export function sanitizeModelMessagesForAgent(
  raw: ModelMessage[],
  validationContext?: Parameters<typeof validateModelMessagesForLlm>[1],
): ModelMessage[] {
  const { messages, mutations } = sanitizeMessages(raw)
  if (mutations.length > 0) {
    log.debug('Message sanitization applied', { mutations, messageCount: messages.length })
  }
  validateModelMessagesForLlm(messages, {
    label: 'sanitizeModelMessagesForAgent',
    allowEmpty: messages.length === 0,
    ...validationContext,
  })
  return messages
}

export type { ClientUiMessage }

export type TrailingUserForPersistence = {
  id: string
  content: string
  createdAt: string
}

export type BuildAgentModelMessagesInput = {
  toolSet: Record<string, unknown>
  /** Used when there is no UI thread to replay, or as the only user turn for step-scoped approval. */
  fallbackUserContent: string
  clientUiMessages?: readonly ClientUiMessage[] | undefined
  /** Appended as a final user turn after the converted UI thread (form executor directive). */
  trailingUserContent?: string
  /**
   * Multi-todo approval: use {@link fallbackUserContent} as the sole user message (current step
   * prompt) instead of the chat's original user request. UI thread supplies tool-call continuation only.
   */
  stepScopedUserOnly?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function partRecord(part: unknown): Record<string, unknown> | undefined {
  return part && typeof part === 'object' ? (part as Record<string, unknown>) : undefined
}

function partToolCallId(part: Record<string, unknown>): string | undefined {
  const id = part.toolCallId
  return typeof id === 'string' && id.trim() ? id.trim() : undefined
}

/**
 * Index of the first assistant `parts` row needed to continue after the latest tool approval.
 * Stops before earlier tools' completed outputs (multi-todo / multi-approval on one stream).
 */
export function findAssistantPartIndexForLatestToolApproval(
  assistant: ClientUiMessage,
): number {
  const parts = assistant.parts ?? []
  if (parts.length === 0) return 0

  let anchorIdx = -1
  let anchorToolCallId: string | undefined
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = partRecord(parts[i])
    if (!p) continue
    const state = typeof p.state === 'string' ? p.state : ''
    if (state === 'approval-responded' || state === 'approval-requested') {
      anchorIdx = i
      anchorToolCallId = partToolCallId(p)
      break
    }
  }
  if (anchorIdx < 0) return 0

  let start = anchorIdx
  if (anchorToolCallId) {
    for (let j = anchorIdx - 1; j >= 0; j--) {
      const p = partRecord(parts[j])
      if (!p) continue
      const tc = partToolCallId(p)
      const state = typeof p.state === 'string' ? p.state : ''
      if (tc && tc !== anchorToolCallId) {
        if (
          state === 'output-available' ||
          state === 'output-error' ||
          state === 'output-denied' ||
          state === 'approval-responded'
        ) {
          start = j + 1
          break
        }
      }
      if (tc === anchorToolCallId) {
        start = j
      }
    }
  }

  return start
}

/** Drop prose/step-progress parts; keep tool-call / approval / output UI parts only. */
function filterAssistantPartsToolRelatedOnly(
  parts: ClientUiMessage['parts'],
): ClientUiMessage['parts'] {
  return parts.filter((part) => {
    const p = partRecord(part)
    if (!p) return false
    const type = typeof p.type === 'string' ? p.type : ''
    if (type === 'text' || type === 'reasoning') return false
    if (type === 'dynamic-tool' || type.startsWith('tool-')) return true
    if (partToolCallId(p)) return true
    const state = typeof p.state === 'string' ? p.state : ''
    return (
      state === 'approval-requested' ||
      state === 'approval-responded' ||
      state.startsWith('output-') ||
      state.startsWith('input-')
    )
  })
}

/**
 * Replay only the latest tool-approval slice (tool parts on the assistant row).
 * Multi-todo runs omit the chat's original user message so the global request does not
 * override the current todo goal; single-todo / standalone keep the user turn.
 */
export function sliceClientUiMessagesForToolApprovalContinuation(
  messages: readonly ClientUiMessage[],
  options: { multiTodoPlan?: boolean } = {},
): ClientUiMessage[] {
  if (!messages.length) return []

  const firstUser = messages.find((m) => m.role === 'user')
  let lastAssistant: ClientUiMessage | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i]
      break
    }
  }

  if (!lastAssistant) {
    return options.multiTodoPlan ? [] : firstUser ? [firstUser] : [...messages]
  }

  const start = findAssistantPartIndexForLatestToolApproval(lastAssistant)
  const slicedParts = lastAssistant.parts.slice(start)
  const toolParts = filterAssistantPartsToolRelatedOnly(slicedParts)
  if (toolParts.length === 0) {
    return options.multiTodoPlan ? [] : firstUser ? [firstUser] : []
  }

  const trimmedAssistant: ClientUiMessage = {
    ...lastAssistant,
    parts: toolParts,
  }

  if (options.multiTodoPlan) {
    return [trimmedAssistant]
  }

  return [...(firstUser ? [firstUser] : []), trimmedAssistant]
}

/** True when the client is resuming after HITL tool approval (not a normal user send). */
export function clientUiIndicatesToolApprovalResume(
  messages: readonly ClientUiMessage[] | undefined,
): boolean {
  if (!messages?.length) return false
  let lastAssistant: ClientUiMessage | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i]
      break
    }
  }
  if (!lastAssistant?.parts?.length) return false
  for (const part of lastAssistant.parts) {
    if (!isRecord(part)) continue
    if (part.state === 'approval-responded') return true
  }
  return false
}

/** Persistable trailing user row (normal send or form submit). */
export function extractTrailingUserForPersistence(
  uiMessages: readonly ClientUiMessage[] | undefined,
): TrailingUserForPersistence | null {
  if (!uiMessages?.length) return null
  const last = uiMessages[uiMessages.length - 1]
  if (last.role !== 'user') return null
  return extractUserRowForPersistence(last)
}

/** Last user row in the thread (even when an assistant placeholder was appended). */
export function extractLastUserForPersistence(
  uiMessages: readonly ClientUiMessage[] | undefined,
): TrailingUserForPersistence | null {
  if (!uiMessages?.length) return null
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    if (uiMessages[i].role !== 'user') continue
    const row = extractUserRowForPersistence(uiMessages[i])
    if (row) return row
  }
  return null
}

function extractUserRowForPersistence(
  last: ClientUiMessage,
): TrailingUserForPersistence | null {
  const id = last.id?.trim()
  if (!id) return null

  const hitlLines: string[] = []
  let text = ''
  for (const p of last.parts) {
    if (!isRecord(p)) continue
    if (p.type === 'text' && typeof p.text === 'string') {
      text += p.text
    } else if (isCollectFormResponsePart(p)) {
      hitlLines.push(formatCollectFormResponsePersistenceLine(p))
    }
  }

  const trimmed = [text.trim(), ...hitlLines].filter(Boolean).join('\n\n').trim()
  if (!trimmed) return null
  const createdRaw =
    (last as { createdAt?: string }).createdAt ??
    (typeof last.metadata === 'object' &&
    last.metadata !== null &&
    typeof (last.metadata as { createdAt?: string }).createdAt === 'string'
      ? (last.metadata as { createdAt: string }).createdAt
      : undefined)
  const createdAt =
    typeof createdRaw === 'string' && createdRaw.trim()
      ? createdRaw.trim()
      : new Date().toISOString()
  return { id, content: trimmed, createdAt }
}

export function flattenMultipartTextLikeModelMessages(
  messages: ModelMessage[],
): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === 'user') {
      const c = m.content
      if (typeof c === 'string') return m
      if (!Array.isArray(c)) return m

      const textLines: string[] = []
      const preservedParts: unknown[] = []
      for (const p of c) {
        if (!p || typeof p !== 'object') continue
        const part = p as { type?: string; text?: unknown }
        if (part.type === 'file' || part.type === 'image' || part.type === 'reasoning-file') {
          preservedParts.push(p)
          continue
        }
        if (typeof part.text === 'string' && part.text.length > 0) {
          textLines.push(part.text)
        }
      }

      if (preservedParts.length === 0) {
        if (textLines.length === 0) return m
        return {
          ...m,
          role: 'user',
          content: textLines.join('\n').trim(),
        } as ModelMessage
      }

      const content: unknown[] = []
      const joined = textLines.join('\n').trim()
      if (joined) content.push({ type: 'text', text: joined })
      content.push(...preservedParts)
      return { ...m, role: 'user', content } as ModelMessage
    }
    if (m.role === 'assistant') {
      const c = m.content
      if (typeof c === 'string') return m
      if (!Array.isArray(c)) return m
      const lines: string[] = []
      for (const p of c) {
        if (!p || typeof p !== 'object') return m
        const typed = p as { type?: string; text?: unknown }
        if (typed.type === 'reasoning') continue
        if (typed.type !== 'text') return m
        if (typeof typed.text !== 'string' || typed.text.length === 0) continue
        lines.push(typed.text)
      }
      if (lines.length === 0) return m
      return { ...m, role: 'assistant', content: lines.join('\n').trim() } as ModelMessage
    }
    return m
  })
}

export type ClientUiToModelConvertOpts = {
  /**
   * Form-submit / trailing step prompt: drop incomplete tool UI parts so the
   * converted thread never has OpenAI-invalid `tool_calls` before the trailing user.
   * HITL tool-approval resume must leave this false so `approval-responded` can execute.
   */
  dropIncompleteApprovals?: boolean
}

/**
 * AI SDK `ignoreIncompleteToolCalls` only drops `input-streaming` / `input-available`.
 * `approval-requested` still converts to assistant `tool-call` with no following tool
 * message — OpenAI then rejects the payload. Drop those UI parts before convert.
 *
 * When {@link ClientUiToModelConvertOpts.dropIncompleteApprovals} is set (form-submit),
 * also drop `approval-responded` (no output yet). Keep `approval-responded` for HITL
 * tool-approval resume so the SDK can execute the approved tool.
 */
function stripIncompleteToolUiParts(
  messages: readonly ClientUiMessage[],
  opts: ClientUiToModelConvertOpts = {},
): ClientUiMessage[] {
  const dropIncompleteApprovals = opts.dropIncompleteApprovals === true
  return messages.map((message) => {
    if (message.role !== 'assistant' || !message.parts?.length) return message
    const parts = message.parts.filter((part) => {
      if (!isRecord(part)) return true
      if (typeof part.type !== 'string') return true
      // Tool UI parts: type "dynamic-tool" or "tool-<name>"
      const isToolPart =
        part.type === 'dynamic-tool' || part.type.startsWith('tool-')
      if (!isToolPart) return true
      const state = typeof part.state === 'string' ? part.state : ''
      if (state === 'approval-requested') return false
      if (dropIncompleteApprovals && state === 'approval-responded') return false
      return true
    })
    if (parts.length === message.parts.length) return message
    return { ...message, parts }
  })
}

export async function clientUiMessagesToModelMessages(
  messages: readonly ClientUiMessage[],
  toolSet: Record<string, unknown>,
  convertOpts: ClientUiToModelConvertOpts = {},
): Promise<ModelMessage[]> {
  const filtered = stripIncompleteToolUiParts(messages, convertOpts)
  return flattenMultipartTextLikeModelMessages(
    await convertToModelMessages(filtered as Parameters<typeof convertToModelMessages>[0], {
      tools: toolSet,
      ignoreIncompleteToolCalls: true,
      convertDataPart: (part) =>
        convertCollectFormDataUIPartToText(part as { type?: string; data?: unknown }),
    }),
  )
}

/**
 * Build `messages` for tool-loop {@link Agent.stream}: optional UI thread replay plus optional
 * trailing user directive (form submit continuation).
 */
export async function buildAgentModelMessages(
  input: BuildAgentModelMessagesInput,
): Promise<ModelMessage[]> {
  const {
    toolSet,
    fallbackUserContent,
    clientUiMessages,
    trailingUserContent,
    stepScopedUserOnly,
  } = input
  const parsed = clientUiMessages?.length
    ? clientUiMessages
    : undefined
  const stepUser = fallbackUserContent.trim()
  const trailing = trailingUserContent?.trim()
  // Form-submit resume always passes trailingUserContent (step executor prompt).
  const formSubmitStyle = Boolean(trailing)

  if (parsed?.length) {
    validateClientUiMessagesForLlm(parsed, { label: 'buildAgentModelMessages' })
  }

  if (!parsed?.length) {
    const content = trailing || stepUser
    return sanitizeModelMessagesForAgent(
      content ? [{ role: 'user', content }] : [],
    )
  }

  const thread = await clientUiMessagesToModelMessages(parsed, toolSet, {
    dropIncompleteApprovals: formSubmitStyle,
  })

  let raw: ModelMessage[]
  if (stepScopedUserOnly && stepUser) {
    raw = [{ role: 'user', content: stepUser }, ...thread]
    if (trailing) raw.push({ role: 'user', content: trailing })
  } else if (trailing) {
    raw = [...thread, { role: 'user', content: trailing }]
  } else if (thread.length > 0) {
    raw = thread
  } else {
    raw = stepUser ? [{ role: 'user', content: stepUser }] : []
  }

  return sanitizeModelMessagesForAgent(raw, { label: 'buildAgentModelMessages' })
}

export { cloneClientUiMessages, parseClientUiMessages } from './client-ui-parse'
