import { readFile } from 'node:fs/promises'
import { uploadFile } from 'ai'
import {
  createAnthropic,
  createGoogle,
  createOpenAI,
  createXai,
} from '@teralexi-ai'
import {
  isNativeMultimodalAttachment,
  providerSupportsNativeFileParts,
  providerSupportsUploadFile,
  resolveAttachmentMediaType,
} from '@shared/agent/multimodal-attachments'
import type { ChatAttachmentMeta } from '@shared/chat/attachments'
import { selectAttachmentsForUserTurn } from '../injection/injectors/user-uploads'
import { resolveChatAttachmentAbsolutePath } from '@main/services/chat-attachments'
import { createLogger } from '@main/logger'
import type { ProviderCredentials, ProviderType } from '../types'
import type { ModelMessage } from '@teralexi-ai'

const log = createLogger('agent.llm.attachment-file-parts')

export type NativeFilePart = {
  type: 'file'
  mediaType: string
  filename?: string
  data: Uint8Array | Record<string, string>
}

function createFilesApi(
  provider: ProviderType,
  creds: ProviderCredentials,
): unknown | undefined {
  try {
    switch (provider) {
      case 'openai':
        return createOpenAI({
          apiKey: creds.openaiApiKey,
          baseURL: creds.openaiBaseURL,
        })
      case 'anthropic':
        return createAnthropic({
          apiKey: creds.anthropicApiKey,
          baseURL: creds.anthropicBaseURL,
        })
      case 'gemini':
        return createGoogle({
          apiKey: creds.geminiApiKey,
          baseURL: creds.geminiBaseURL,
        })
      case 'xai':
        return createXai({
          apiKey: creds.xaiApiKey,
          baseURL: creds.xaiBaseURL,
        })
      default:
        return undefined
    }
  } catch (err) {
    log.warn('Failed to create files API for provider', { provider, err })
    return undefined
  }
}

async function buildOneFilePart(params: {
  conversationId: string
  attachment: ChatAttachmentMeta
  provider: ProviderType
  creds: ProviderCredentials
}): Promise<NativeFilePart | null> {
  const mediaType = resolveAttachmentMediaType(params.attachment)
  const absPath = resolveChatAttachmentAbsolutePath({
    conversationId: params.conversationId,
    sandboxPath: params.attachment.sandboxPath,
  })

  let data: Uint8Array
  try {
    data = await readFile(absPath)
  } catch (err) {
    log.warn('Failed to read attachment for multimodal part', {
      sandboxPath: params.attachment.sandboxPath,
      err,
    })
    return null
  }

  if (providerSupportsUploadFile(params.provider)) {
    const api = createFilesApi(params.provider, params.creds)
    if (api) {
      try {
        const uploaded = await uploadFile({
          api: api as never,
          data,
          filename: params.attachment.originalName,
          mediaType,
          ...(params.provider === 'openai'
            ? {
                providerOptions: {
                  openai: { purpose: 'assistants' },
                },
              }
            : {}),
        })
        if (uploaded?.providerReference) {
          return {
            type: 'file',
            mediaType,
            filename: params.attachment.originalName,
            data: uploaded.providerReference,
          }
        }
      } catch (err) {
        log.warn('uploadFile failed; falling back to inline bytes', {
          provider: params.provider,
          name: params.attachment.originalName,
          err,
        })
      }
    }
  }

  return {
    type: 'file',
    mediaType,
    filename: params.attachment.originalName,
    data,
  }
}

/**
 * Build AI SDK file parts for multimodal attachments on capable providers.
 * Uses `uploadFile` when the provider supports it; otherwise inlines bytes.
 */
export async function buildNativeFilePartsForAttachments(params: {
  conversationId: string
  provider: ProviderType
  creds: ProviderCredentials
  attachments: readonly ChatAttachmentMeta[]
}): Promise<NativeFilePart[]> {
  if (!providerSupportsNativeFileParts(params.provider)) return []
  const multimodal = params.attachments.filter(isNativeMultimodalAttachment)
  if (multimodal.length === 0) return []

  const parts: NativeFilePart[] = []
  for (const attachment of multimodal) {
    const part = await buildOneFilePart({
      conversationId: params.conversationId,
      attachment,
      provider: params.provider,
      creds: params.creds,
    })
    if (part) parts.push(part)
  }
  return parts
}

function findTrailingUserMessageIndex(messages: ModelMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return i
  }
  return -1
}

/**
 * Append native file parts to the trailing user message (after text injectors).
 */
export async function appendNativeFilePartsToTrailingUserMessage(params: {
  messages: ModelMessage[]
  conversationId?: string
  provider: ProviderType
  creds: ProviderCredentials
  attachments?: readonly ChatAttachmentMeta[]
  latestUserMessageId?: string
  pendingUserMessageId?: string
}): Promise<ModelMessage[]> {
  const conversationId = params.conversationId?.trim()
  if (!conversationId) return params.messages
  if (!providerSupportsNativeFileParts(params.provider)) return params.messages

  const selected = selectAttachmentsForUserTurn(
    params.attachments,
    params.latestUserMessageId,
    params.pendingUserMessageId,
  )
  const fileParts = await buildNativeFilePartsForAttachments({
    conversationId,
    provider: params.provider,
    creds: params.creds,
    attachments: selected,
  })
  if (fileParts.length === 0) return params.messages

  const idx = findTrailingUserMessageIndex(params.messages)
  if (idx < 0) return params.messages

  const message = params.messages[idx]!
  const existing = message.content
  const textParts: unknown[] =
    typeof existing === 'string'
      ? existing.trim()
        ? [{ type: 'text', text: existing }]
        : []
      : Array.isArray(existing)
        ? [...existing]
        : []

  const next = [...params.messages]
  next[idx] = {
    ...message,
    role: 'user',
    content: [...textParts, ...fileParts],
  } as ModelMessage
  return next
}
