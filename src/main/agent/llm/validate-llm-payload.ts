/**
 * Pre-flight validation for any payload sent to LLM providers (`streamText`, `Agent.stream`).
 *
 * Layer 1 — AI SDK {@link modelMessageSchema} (Zod) per message row.
 * Layer 2 — Semantic invariants (tool/approval pairing, role alternation, HITL shape).
 */
import { modelMessageSchema, type ModelMessage } from 'ai'
import { createLogger } from '@main/logger'
import type { AgentMessage } from '../types'
import type { ClientUiMessage } from '../utils/client-ui-parse'
import { isClientUiMessage } from '../utils/client-ui-parse'
import type { StreamTextParams } from './runtime'

const log = createLogger('agent.llm.validate')

export type LlmValidationIssue = {
  code: string
  message: string
  path?: string
  meta?: Record<string, unknown>
}

export type LlmMessageValidationContext = {
  label?: string
  conversationId?: string
  stepId?: string | null
  agentId?: string
  /** When true, an empty `messages` array is allowed. Default false. */
  allowEmpty?: boolean
}

export class LlmPayloadValidationError extends Error {
  readonly issues: LlmValidationIssue[]
  readonly context?: LlmMessageValidationContext

  constructor(
    message: string,
    issues: LlmValidationIssue[],
    context?: LlmMessageValidationContext,
  ) {
    super(message)
    this.name = 'LlmPayloadValidationError'
    this.issues = issues
    this.context = context
  }
}

type ContentPart = Record<string, unknown>

function contentParts(content: unknown): ContentPart[] {
  if (!Array.isArray(content)) return []
  return content.filter(
    (p): p is ContentPart => typeof p === 'object' && p !== null,
  )
}

function messageSummary(messages: readonly unknown[]): Record<string, unknown> {
  return {
    messageCount: messages.length,
    roles: messages.map((m, i) => {
      if (!m || typeof m !== 'object') return `[${i}]:invalid`
      const role = (m as { role?: unknown }).role
      const content = (m as { content?: unknown }).content
      const partTypes =
        typeof content === 'string'
          ? ['text']
          : Array.isArray(content)
            ? contentParts(content).map((p) => String(p.type ?? 'unknown'))
            : []
      return { index: i, role, partTypes }
    }),
  }
}

function schemaIssuesForModelMessages(
  messages: readonly unknown[],
): LlmValidationIssue[] {
  const issues: LlmValidationIssue[] = []
  for (let i = 0; i < messages.length; i++) {
    const parsed = modelMessageSchema.safeParse(messages[i])
    if (!parsed.success) {
      issues.push({
        code: 'schema-invalid',
        message: parsed.error.issues[0]?.message ?? 'Invalid model message',
        path: `messages[${i}]`,
        meta: {
          zodIssues: parsed.error.issues.slice(0, 5),
        },
      })
    }
  }
  return issues
}

function semanticIssuesForModelMessages(
  messages: readonly ModelMessage[],
): LlmValidationIssue[] {
  const issues: LlmValidationIssue[] = []
  const declaredToolCallIds = new Set<string>()
  const declaredApprovalIds = new Set<string>()

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const path = `messages[${i}]`

    if (i > 0 && msg.role === 'assistant' && messages[i - 1]?.role === 'assistant') {
      issues.push({
        code: 'consecutive-assistant',
        message:
          'Two assistant messages in a row; merge or split tool steps explicitly',
        path,
      })
    }

    if (msg.role === 'assistant') {
      const parts = contentParts(msg.content)
      const toolCallIdsInAssistant = new Set<string>()

      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi]
        const partPath = `${path}.content[${pi}]`
        const type = typeof part.type === 'string' ? part.type : ''

        if (type === 'tool-call') {
          const toolCallId =
            typeof part.toolCallId === 'string' ? part.toolCallId.trim() : ''
          if (!toolCallId) {
            issues.push({
              code: 'tool-call-missing-id',
              message: 'Tool call part is missing toolCallId',
              path: partPath,
            })
            continue
          }
          if (toolCallIdsInAssistant.has(toolCallId)) {
            issues.push({
              code: 'duplicate-tool-call-in-assistant',
              message: `Duplicate toolCallId "${toolCallId}" in one assistant message`,
              path: partPath,
              meta: { toolCallId },
            })
          }
          toolCallIdsInAssistant.add(toolCallId)
          declaredToolCallIds.add(toolCallId)
        }

        if (type === 'tool-approval-request') {
          const approvalId =
            typeof part.approvalId === 'string' ? part.approvalId.trim() : ''
          const toolCallId =
            typeof part.toolCallId === 'string' ? part.toolCallId.trim() : ''
          if (!approvalId) {
            issues.push({
              code: 'approval-request-missing-id',
              message: 'tool-approval-request is missing approvalId',
              path: partPath,
            })
          } else {
            declaredApprovalIds.add(approvalId)
          }
          if (!toolCallId) {
            issues.push({
              code: 'approval-request-missing-tool-call',
              message: 'tool-approval-request is missing toolCallId',
              path: partPath,
            })
          } else if (!toolCallIdsInAssistant.has(toolCallId)) {
            issues.push({
              code: 'approval-request-orphan-tool-call',
              message: `tool-approval-request references toolCallId "${toolCallId}" not declared in the same assistant message`,
              path: partPath,
              meta: { toolCallId, approvalId },
            })
          }
        }
      }
    }

    if (msg.role === 'tool') {
      const parts = contentParts(msg.content)
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi]
        const partPath = `${path}.content[${pi}]`
        const type = typeof part.type === 'string' ? part.type : ''

        if (type === 'tool-result') {
          const toolCallId =
            typeof part.toolCallId === 'string' ? part.toolCallId.trim() : ''
          if (!toolCallId) {
            issues.push({
              code: 'tool-result-missing-id',
              message: 'tool-result is missing toolCallId',
              path: partPath,
            })
          } else if (!declaredToolCallIds.has(toolCallId)) {
            issues.push({
              code: 'orphan-tool-result',
              message: `tool-result references undeclared toolCallId "${toolCallId}"`,
              path: partPath,
              meta: { toolCallId },
            })
          }
        }

        if (type === 'tool-approval-response') {
          const approvalId =
            typeof part.approvalId === 'string' ? part.approvalId.trim() : ''
          if (!approvalId) {
            issues.push({
              code: 'approval-response-missing-id',
              message: 'tool-approval-response is missing approvalId',
              path: partPath,
            })
          } else if (!declaredApprovalIds.has(approvalId)) {
            issues.push({
              code: 'orphan-tool-approval-response',
              message: `tool-approval-response references unknown approvalId "${approvalId}"`,
              path: partPath,
              meta: { approvalId },
            })
          }
        }
      }
    }
  }

  return issues
}

function assertNoIssues(
  issues: LlmValidationIssue[],
  context: LlmMessageValidationContext | undefined,
  messages: readonly unknown[],
): void {
  if (issues.length === 0) return

  const summary = messageSummary(messages)
  log.error('LLM payload validation failed', {
    ...context,
    issueCount: issues.length,
    issues,
    ...summary,
  })

  throw new LlmPayloadValidationError(
    `LLM payload validation failed (${issues.length} issue(s)): ${issues[0]?.message ?? 'unknown'}`,
    issues,
    context,
  )
}

/** Validate {@link ModelMessage}[] before tool-loop / HITL resume. */
export function validateModelMessagesForLlm(
  messages: readonly ModelMessage[],
  context?: LlmMessageValidationContext,
): void {
  if (messages.length === 0 && !context?.allowEmpty) {
    assertNoIssues(
      [
        {
          code: 'empty-messages',
          message: 'messages array is empty',
          path: 'messages',
        },
      ],
      context,
      messages,
    )
  }

  const issues = [
    ...schemaIssuesForModelMessages(messages),
    ...semanticIssuesForModelMessages(messages),
  ]
  assertNoIssues(issues, context, messages)
}

/** Validate pipeline {@link AgentMessage} rows (string content only). */
export function validateSimpleMessagesForLlm(
  messages: readonly AgentMessage[],
  context?: LlmMessageValidationContext,
): void {
  const issues: LlmValidationIssue[] = []

  if (messages.length === 0 && !context?.allowEmpty) {
    issues.push({
      code: 'empty-messages',
      message: 'messages array is empty',
      path: 'messages',
    })
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const path = `messages[${i}]`
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      issues.push({
        code: 'invalid-role',
        message: `Unsupported role "${String(msg.role)}"`,
        path,
      })
    }
    if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
      issues.push({
        code: 'empty-content',
        message: 'Message content must be a non-empty string',
        path: `${path}.content`,
      })
    }
  }

  assertNoIssues(issues, context, messages)
}

function looksLikeModelMessages(messages: readonly unknown[]): boolean {
  return messages.some((m) => {
    if (!m || typeof m !== 'object') return false
    const role = (m as { role?: unknown }).role
    if (role === 'tool') return true
    const content = (m as { content?: unknown }).content
    return Array.isArray(content)
  })
}

/** Validate `streamText` params before calling the provider. */
export function validateStreamTextParamsForLlm(
  params: StreamTextParams,
  context?: LlmMessageValidationContext,
): void {
  const raw = params.messages
  if (!Array.isArray(raw) || raw.length === 0) {
    if (context?.allowEmpty) return
    // prompt-only calls are valid (no messages array)
    if (typeof (params as { prompt?: unknown }).prompt === 'string') return
    return
  }

  if (looksLikeModelMessages(raw)) {
    validateModelMessagesForLlm(raw as ModelMessage[], context)
    return
  }

  validateSimpleMessagesForLlm(raw as AgentMessage[], context)
}

/** Validate client UI rows before `convertToModelMessages`. */
export function validateClientUiMessagesForLlm(
  messages: readonly ClientUiMessage[],
  context?: LlmMessageValidationContext,
): void {
  const issues: LlmValidationIssue[] = []

  if (messages.length === 0 && !context?.allowEmpty) {
    issues.push({
      code: 'empty-ui-messages',
      message: 'clientUiMessages array is empty',
      path: 'clientUiMessages',
    })
  }

  for (let i = 0; i < messages.length; i++) {
    if (!isClientUiMessage(messages[i])) {
      issues.push({
        code: 'invalid-ui-message',
        message: 'Invalid client UI message row',
        path: `clientUiMessages[${i}]`,
      })
      continue
    }
    const msg = messages[i]
    if (msg.parts.length === 0) {
      issues.push({
        code: 'empty-ui-parts',
        message: 'UI message has no parts',
        path: `clientUiMessages[${i}].parts`,
      })
    }
  }

  assertNoIssues(issues, context, messages)
}
