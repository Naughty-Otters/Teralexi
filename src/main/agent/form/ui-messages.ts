/**
 * Collect-form HITL data parts in client UI message threads.
 */
import type { TextPart } from '@openfde-ai'
import type { ClientUiMessage } from '../utils/client-ui-parse'
import { createLogger } from '@main/logger'

const log = createLogger('form.ui-messages')

export type { ClientUiMessage }

export type CollectFormRequestData = {
  todoId?: number
  todoName?: string
  formDocName?: string
  /** Resolved from prior-step `form-projection.json` when schema binds `titleFrom`. */
  title?: string
  /** Resolved from prior-step projection when schema binds `messageFrom`. */
  message?: string
  fields?: Array<{
    key: string
    label: string
    type: string
    required?: boolean
    placeholder?: string
    options?: Array<{ value: string; label: string }>
  }>
  markdownPreview?: string
}

export type CollectFormResponseData = {
  values?: Record<string, unknown>
}

export type CollectFormRequestPart = {
  type: 'data-collect-form-request'
  id?: string
  data?: CollectFormRequestData
}

export type CollectFormResponsePart = {
  type: 'data-collect-form-response'
  id?: string
  data?: CollectFormResponseData | Record<string, unknown>
}

export type CollectFormResponse = {
  requestId: string
  values: Record<string, unknown>
  todoId?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCollectFormRequestPart(part: unknown): part is CollectFormRequestPart {
  return isRecord(part) && part.type === 'data-collect-form-request'
}

export function isCollectFormResponsePart(part: unknown): part is CollectFormResponsePart {
  return isRecord(part) && part.type === 'data-collect-form-response'
}

function collectFormValuesFromResponseData(
  data: CollectFormResponseData | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!data || !isRecord(data)) return {}
  if (isRecord(data.values) && !Array.isArray(data.values)) {
    return { ...(data.values as Record<string, unknown>) }
  }
  return { ...data }
}

export function findCollectFormRequestMeta(
  uiMessages: readonly ClientUiMessage[] | undefined,
  requestId: string,
): { todoId?: number; todoName?: string } | undefined {
  const rid = requestId.trim()
  if (!rid || !uiMessages?.length) return undefined

  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const m = uiMessages[i]
    if (m.role !== 'assistant') continue
    for (const p of m.parts) {
      if (!isCollectFormRequestPart(p)) continue
      if (typeof p.id !== 'string' || p.id.trim() !== rid) continue
      const d = p.data
      const todoId =
        typeof d?.todoId === 'number' && Number.isFinite(d.todoId) ? d.todoId : undefined
      const todoName =
        typeof d?.todoName === 'string' ? d.todoName.trim() : undefined
      return { todoId, todoName }
    }
  }
  return undefined
}

export function extractCollectFormResponse(
  uiMessages: readonly ClientUiMessage[] | undefined,
): CollectFormResponse | undefined {
  if (!uiMessages?.length) return undefined

  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const m = uiMessages[i]
    if (m.role !== 'user') continue
    for (const p of m.parts) {
      if (!isCollectFormResponsePart(p)) continue
      const id = p.id
      if (typeof id !== 'string' || !id.trim()) continue
      const values = collectFormValuesFromResponseData(p.data)
      const meta = findCollectFormRequestMeta(uiMessages, id.trim())
      return {
        requestId: id.trim(),
        values,
        todoId: meta?.todoId,
      }
    }
  }
  return undefined
}

export function uiMessagesIndicateFormCollectionResume(
  uiMessages: readonly ClientUiMessage[] | undefined,
): boolean {
  return extractCollectFormResponse(uiMessages) !== undefined
}

export function formValuesProvidedByClientRequest(
  uiMessages: readonly ClientUiMessage[] | undefined,
  todoId: number,
): boolean {
  const formResp = extractCollectFormResponse(uiMessages)
  if (!formResp || Object.keys(formResp.values).length === 0) return false
  return (
    typeof formResp.todoId === 'number' &&
    Number.isFinite(formResp.todoId) &&
    formResp.todoId === todoId
  )
}

export function applyCollectFormResponsesToUiMessages(
  collectedFormByTodoId: Record<number, Record<string, unknown>>,
  uiMessages: readonly ClientUiMessage[] | undefined,
): { applied: boolean; todoId?: number } {
  const formResp = extractCollectFormResponse(uiMessages)
  if (!formResp || Object.keys(formResp.values).length === 0) {
    return { applied: false }
  }
  const todoId = formResp.todoId
  if (typeof todoId !== 'number' || !Number.isFinite(todoId)) {
    log.warn('Form response in UI messages but todoId missing on matching request', {
      requestId: formResp.requestId,
    })
    return { applied: false }
  }
  collectedFormByTodoId[todoId] = { ...formResp.values }
  return { applied: true, todoId }
}

export function convertCollectFormDataUIPartToText(part: {
  type?: string
  data?: unknown
}): TextPart | undefined {
  const t = typeof part.type === 'string' ? part.type : ''
  if (t !== 'data-collect-form-response' && !t.startsWith('data-collect-form')) {
    return undefined
  }
  let body = ''
  try {
    body =
      part.data !== undefined && part.data !== null
        ? JSON.stringify(part.data)
        : ''
  } catch {
    body = String(part.data)
  }
  return { type: 'text', text: body }
}

/** Format a form response part for persistence (trailing user row). */
export function formatCollectFormResponsePersistenceLine(part: {
  id?: string
  data?: unknown
}): string {
  const rid = typeof part.id === 'string' ? part.id.trim() : ''
  let line = `[data-collect-form-response${rid ? `:${rid}` : ''}]`
  if (part.data && isRecord(part.data)) {
    try {
      line += `\n${JSON.stringify(part.data)}`
    } catch {
      /* ignore */
    }
  }
  return line
}
