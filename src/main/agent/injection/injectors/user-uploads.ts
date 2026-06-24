import { buildInjectorUserMessage } from '../injector'
import type { UserMessageInjector } from '../types'
import {
  formatChatAttachmentSize,
  type ChatAttachmentMeta,
} from '@shared/chat/attachments'
import { INJECTOR_ORDER } from './orders'

export function formatUserUploadsInstructionBlock(
  attachments: readonly ChatAttachmentMeta[],
): string | null {
  if (attachments.length === 0) return null
  const lines = [
    '### User-uploaded files',
    'The user attached the following files to this message. They are available in the sandbox. Use `read_file` (and other tools as needed) to inspect them. Paths are relative to the sandbox root.',
    ...attachments.map(
      (item) =>
        `- \`${item.sandboxPath}\` (${item.originalName}, ${formatChatAttachmentSize(item.sizeBytes)})`,
    ),
  ]
  return lines.join('\n')
}

export const userUploadsInjector: UserMessageInjector = {
  id: 'user-uploads',
  kind: 'user-message',
  order: INJECTOR_ORDER.USER_UPLOADS,
  applies({ ctx }) {
    return (ctx.opts.userAttachments?.length ?? 0) > 0
  },
  injectUserMessage({ ctx }) {
    const block = formatUserUploadsInstructionBlock(ctx.opts.userAttachments ?? [])
    if (!block) return null
    return buildInjectorUserMessage('user-uploads', block)
  },
}
