import { buildInjectorUserMessage } from '../injector'
import { USER_UPLOADS_INJECTOR_MARKER } from '../injection-message-content'
import type { UserMessageInjector } from '../types'
import {
  formatChatAttachmentSize,
  type ChatAttachmentMeta,
} from '@shared/chat/attachments'
import { loadUserUploadsInlineText } from '@main/services/chat-attachments'
import { INJECTOR_ORDER } from './orders'

export function selectAttachmentsForUserTurn(
  attachments: readonly ChatAttachmentMeta[] | undefined,
  latestUserMessageId?: string,
  pendingUserMessageId?: string,
): ChatAttachmentMeta[] {
  const all = attachments ?? []
  if (all.length === 0) return []

  const turnId = pendingUserMessageId?.trim() || latestUserMessageId?.trim()
  if (!turnId) return [...all]

  const scoped = all.filter((item) => {
    const messageId = item.messageId?.trim()
    return !messageId || messageId === turnId
  })
  return scoped.length > 0 ? scoped : [...all]
}

function fenceLanguageForAttachment(name: string): string {
  const ext = name.trim().split('.').pop()?.toLowerCase() ?? ''
  if (!ext || ext === name.toLowerCase()) return 'text'
  return ext
}

export function formatUserUploadsInstructionBlock(
  attachments: readonly ChatAttachmentMeta[],
  inlineTextBySandboxPath?: ReadonlyMap<string, string>,
): string | null {
  if (attachments.length === 0) return null

  const lines = [
    USER_UPLOADS_INJECTOR_MARKER,
    'The user attached the following files to this message. Text files are included inline; images/PDFs may also be sent as native multimodal parts when the model supports them; other files are available in the sandbox by path.',
  ]

  for (const item of attachments) {
    const sizeLabel = formatChatAttachmentSize(item.sizeBytes)
    const inlineText = inlineTextBySandboxPath?.get(item.sandboxPath)
    if (inlineText !== undefined) {
      lines.push(
        '',
        `#### ${item.originalName} (${sizeLabel})`,
        `Path: \`${item.sandboxPath}\``,
        `\`\`\`${fenceLanguageForAttachment(item.originalName)}`,
        inlineText,
        '```',
      )
      continue
    }

    lines.push(
      `- \`${item.sandboxPath}\` (${item.originalName}, ${sizeLabel}) — use \`read_file\` or other tools as needed.`,
    )
  }

  return lines.join('\n')
}

export async function buildUserUploadsInstructionBlock(
  attachments: readonly ChatAttachmentMeta[],
  options?: { conversationId?: string },
): Promise<string | null> {
  if (attachments.length === 0) return null
  const conversationId = options?.conversationId?.trim()
  const inlineTextBySandboxPath = conversationId
    ? await loadUserUploadsInlineText(conversationId, attachments)
    : undefined
  return formatUserUploadsInstructionBlock(attachments, inlineTextBySandboxPath)
}

function selectedAttachmentsForRun(
  ctx: Parameters<UserMessageInjector['applies']>[0]['ctx'],
  latestUserMessageId?: string,
): ChatAttachmentMeta[] {
  return selectAttachmentsForUserTurn(
    ctx.opts.userAttachments,
    latestUserMessageId,
    ctx.opts.pendingUserMessage?.id,
  )
}

export const userUploadsInjector: UserMessageInjector = {
  id: 'user-uploads',
  kind: 'user-message',
  order: INJECTOR_ORDER.USER_UPLOADS,
  applies({ ctx, loopStep, latestUserMessageId }) {
    if (loopStep > 0) return false
    return selectedAttachmentsForRun(ctx, latestUserMessageId).length > 0
  },
  async augmentTrailingUserMessage({ ctx, latestUserMessageId }) {
    return buildUserUploadsInstructionBlock(
      selectedAttachmentsForRun(ctx, latestUserMessageId),
      { conversationId: ctx.opts.conversationId },
    )
  },
  async injectUserMessage({ ctx, latestUserMessageId }) {
    const block = await buildUserUploadsInstructionBlock(
      selectedAttachmentsForRun(ctx, latestUserMessageId),
      { conversationId: ctx.opts.conversationId },
    )
    if (!block) return null
    return buildInjectorUserMessage('user-uploads', block)
  },
}
