import { access, copyFile, lstat, mkdir, readFile } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { randomUUID } from 'crypto'
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  CHAT_ATTACHMENT_INLINE_TEXT_MAX_BYTES,
  chatUploadsDirForMessage,
  isAllowedChatAttachmentName,
  isTextBasedChatAttachment,
  mimeTypeForChatAttachmentName,
  sanitizeChatAttachmentFilename,
  type ChatAttachmentMeta,
} from '@shared/chat/attachments'
import {
  getOrCreateSandboxForConversation,
} from '@main/agent/sandbox/registry'
import { resolveSandboxRootForConversation } from '@main/agent/sandbox/registry'
import { getConversationStore } from '@main/services/conversation-store'
import { storedAttachmentToMeta } from '@main/services/conversation-store/message-attachments-repository'
import {
  extractLastUserForPersistence,
  parseClientUiMessages,
} from '@main/agent/utils'

async function assertRegularFile(path: string): Promise<{ size: number; name: string }> {
  const stat = await lstat(path)
  if (stat.isSymbolicLink()) {
    throw new Error('Symlinks are not allowed for chat attachments.')
  }
  if (!stat.isFile()) {
    throw new Error('Only regular files can be attached.')
  }
  return { size: stat.size, name: basename(path) }
}

function uniqueDestName(existing: Set<string>, preferred: string): string {
  if (!existing.has(preferred)) {
    existing.add(preferred)
    return preferred
  }
  const extMatch = preferred.match(/(\.[^.]+)$/)
  const ext = extMatch?.[1] ?? ''
  const stem = ext ? preferred.slice(0, -ext.length) : preferred
  let n = 2
  while (true) {
    const candidate = `${stem}-${n}${ext}`
    if (!existing.has(candidate)) {
      existing.add(candidate)
      return candidate
    }
    n += 1
  }
}

export async function ingestChatAttachments(args: {
  conversationId: string
  messageId: string
  sourcePaths: string[]
}): Promise<{ ok: boolean; attachments: ChatAttachmentMeta[]; error?: string }> {
  const conversationId = args.conversationId?.trim() ?? ''
  const messageId = args.messageId?.trim() ?? ''
  const sourcePaths = (args.sourcePaths ?? [])
    .map((p) => p.trim())
    .filter(Boolean)

  if (!conversationId) {
    return { ok: false, attachments: [], error: 'conversationId is required.' }
  }
  if (!messageId) {
    return { ok: false, attachments: [], error: 'messageId is required.' }
  }
  if (sourcePaths.length === 0) {
    return { ok: true, attachments: [] }
  }
  if (!getConversationStore().messageExists(messageId)) {
    return {
      ok: false,
      attachments: [],
      error: 'User message must be saved before attachments can be linked.',
    }
  }
  if (sourcePaths.length > CHAT_ATTACHMENT_MAX_FILES) {
    return {
      ok: false,
      attachments: [],
      error: `At most ${CHAT_ATTACHMENT_MAX_FILES} files can be attached per message.`,
    }
  }

  const sandbox = await getOrCreateSandboxForConversation(conversationId)
  const uploadDir = join(
    sandbox.layout.root,
    chatUploadsDirForMessage(messageId),
  )
  await mkdir(uploadDir, { recursive: true })

  const usedNames = new Set<string>()
  const metas: ChatAttachmentMeta[] = []
  const now = new Date().toISOString()

  for (const sourcePath of sourcePaths) {
    const resolvedSource = resolve(sourcePath)
    try {
      await access(resolvedSource)
    } catch {
      return {
        ok: false,
        attachments: [],
        error: `File not found: ${basename(sourcePath)}`,
      }
    }

    let fileInfo: { size: number; name: string }
    try {
      fileInfo = await assertRegularFile(resolvedSource)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, attachments: [], error: message }
    }

    if (fileInfo.size > CHAT_ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        attachments: [],
        error: `${fileInfo.name} exceeds the ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit.`,
      }
    }

    if (!isAllowedChatAttachmentName(fileInfo.name)) {
      return {
        ok: false,
        attachments: [],
        error: `Unsupported file type: ${fileInfo.name}`,
      }
    }

    const safeName = uniqueDestName(
      usedNames,
      sanitizeChatAttachmentFilename(fileInfo.name),
    )
    const destPath = join(uploadDir, safeName)
    await copyFile(resolvedSource, destPath)

    const sandboxPath = join(chatUploadsDirForMessage(messageId), safeName).replace(
      /\\/g,
      '/',
    )
    metas.push({
      id: randomUUID(),
      originalName: safeName,
      mimeType: mimeTypeForChatAttachmentName(safeName),
      sizeBytes: fileInfo.size,
      sandboxPath,
      messageId,
    })
  }

  getConversationStore().insertMessageAttachments(
    metas.map((meta) => ({
      id: meta.id,
      messageId,
      conversationId,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      sandboxPath: meta.sandboxPath,
      createdAt: now,
    })),
  )

  return { ok: true, attachments: metas }
}

function resolveAttachmentMessageId(args: {
  messageId?: string
  uiMessages?: unknown[]
}): string {
  const explicit = args.messageId?.trim()
  if (explicit) return explicit
  return (
    extractLastUserForPersistence(parseClientUiMessages(args.uiMessages))?.id?.trim() ??
    ''
  )
}

export type EnsureUserAttachmentsArgs = {
  conversationId: string
  messageId?: string
  uiMessages?: unknown[]
  userAttachments?: ChatAttachmentMeta[]
  attachmentSourcePaths?: string[]
}

/**
 * Copy staged user files into sandbox `input/uploads/<messageId>/` before the
 * agent run starts. Must run after the user message row is persisted.
 */
export async function ensureUserAttachmentsUploadedBeforeAgentRun(
  args: EnsureUserAttachmentsArgs,
): Promise<{ attachments: ChatAttachmentMeta[]; error?: string }> {
  if (args.userAttachments?.length) {
    return { attachments: args.userAttachments }
  }

  const sourcePaths = (args.attachmentSourcePaths ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
  const messageId = resolveAttachmentMessageId(args)

  if (sourcePaths.length > 0) {
    if (!messageId) {
      return {
        attachments: [],
        error:
          'User message must be saved before attachments can be uploaded to the sandbox.',
      }
    }
    const result = await ingestChatAttachments({
      conversationId: args.conversationId,
      messageId,
      sourcePaths,
    })
    if (!result.ok) {
      return { attachments: [], error: result.error ?? 'Attachment upload failed.' }
    }
    return { attachments: result.attachments }
  }

  if (!messageId) return { attachments: [] }

  return {
    attachments: getConversationStore()
      .getMessageAttachmentsForMessage(messageId)
      .map(storedAttachmentToMeta),
  }
}

/** @deprecated Prefer {@link ensureUserAttachmentsUploadedBeforeAgentRun}. */
export async function resolveUserAttachmentsForTurn(
  args: EnsureUserAttachmentsArgs,
): Promise<{ attachments: ChatAttachmentMeta[]; error?: string }> {
  return ensureUserAttachmentsUploadedBeforeAgentRun(args)
}

export function searchChatAttachments(
  conversationId: string,
  query: string,
  limit = 20,
): string[] {
  const rows = getConversationStore().searchMessageAttachments(
    conversationId,
    query,
    limit,
  )
  return rows.map((row) => row.sandboxPath.replace(/\\/g, '/'))
}

export function listConversationAttachmentMetas(
  conversationId: string,
): ChatAttachmentMeta[] {
  return getConversationStore()
    .getMessageAttachmentsForConversation(conversationId)
    .map(storedAttachmentToMeta)
}

export function resolveChatAttachmentAbsolutePath(args: {
  conversationId: string
  sandboxPath: string
}): string {
  const root = resolveSandboxRootForConversation(args.conversationId.trim())
  const rel = args.sandboxPath.replace(/^[/\\]+/, '')
  return resolve(root, rel)
}

export async function readTextChatAttachmentContent(args: {
  conversationId: string
  attachment: ChatAttachmentMeta
  maxBytes?: number
}): Promise<string | null> {
  const conversationId = args.conversationId?.trim()
  if (!conversationId) return null
  if (!isTextBasedChatAttachment(args.attachment)) return null

  const maxBytes = args.maxBytes ?? CHAT_ATTACHMENT_INLINE_TEXT_MAX_BYTES
  if (args.attachment.sizeBytes > maxBytes) return null

  const absPath = resolveChatAttachmentAbsolutePath({
    conversationId,
    sandboxPath: args.attachment.sandboxPath,
  })
  try {
    const buffer = await readFile(absPath)
    if (buffer.byteLength > maxBytes) return null
    if (buffer.includes(0)) return null
    return buffer.toString('utf8')
  } catch {
    return null
  }
}

export async function loadUserUploadsInlineText(
  conversationId: string,
  attachments: readonly ChatAttachmentMeta[],
): Promise<Map<string, string>> {
  const inline = new Map<string, string>()
  const trimmedConversationId = conversationId?.trim()
  if (!trimmedConversationId) return inline

  await Promise.all(
    attachments.map(async (attachment) => {
      const text = await readTextChatAttachmentContent({
        conversationId: trimmedConversationId,
        attachment,
      })
      if (text === null) return
      inline.set(attachment.sandboxPath, text)
    }),
  )

  return inline
}

export function buildPickChatAttachmentDialogFilters(): Electron.FileFilter[] {
  const extensions = [
    'txt',
    'md',
    'json',
    'yaml',
    'yml',
    'csv',
    'html',
    'css',
    'js',
    'ts',
    'tsx',
    'jsx',
    'py',
    'pdf',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
  ]
  return [
    {
      name: 'Supported files',
      extensions,
    },
    { name: 'All files', extensions: ['*'] },
  ]
}
