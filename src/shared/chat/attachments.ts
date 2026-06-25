export type ChatAttachmentMeta = {
  id: string
  originalName: string
  mimeType: string | null
  sizeBytes: number
  /** Path relative to the conversation sandbox root. */
  sandboxPath: string
  messageId?: string
}

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_ATTACHMENT_MAX_FILES = 5
/** Max size for inlining attachment text into the user-message injector. */
export const CHAT_ATTACHMENT_INLINE_TEXT_MAX_BYTES = 512 * 1024

export const CHAT_ATTACHMENT_ALLOWED_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'xml',
  'csv',
  'tsv',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'sql',
  'sh',
  'bash',
  'zsh',
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
  'rtf',
  'log',
  'ini',
  'toml',
  'env',
] as const

const EXTENSION_MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  xml: 'application/xml',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  py: 'text/x-python',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const CHAT_ATTACHMENT_BINARY_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
])

const CHAT_ATTACHMENT_TEXT_MIME_PREFIXES = ['text/'] as const

const CHAT_ATTACHMENT_TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'image/svg+xml',
])

const CHAT_ATTACHMENT_BINARY_MIME_PREFIXES = ['image/', 'audio/', 'video/'] as const

const CHAT_ATTACHMENT_BINARY_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export function chatAttachmentExtension(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() ?? name
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function isAllowedChatAttachmentName(name: string): boolean {
  const ext = chatAttachmentExtension(name)
  if (!ext) return false
  return (CHAT_ATTACHMENT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)
}

export function mimeTypeForChatAttachmentName(name: string): string | null {
  const ext = chatAttachmentExtension(name)
  if (!ext) return null
  return EXTENSION_MIME[ext] ?? null
}

export function isTextBasedChatAttachment(
  meta: Pick<ChatAttachmentMeta, 'originalName' | 'mimeType'>,
): boolean {
  const mime = meta.mimeType?.trim().toLowerCase()
  if (mime) {
    if (CHAT_ATTACHMENT_TEXT_MIME_TYPES.has(mime)) return true
    if (CHAT_ATTACHMENT_BINARY_MIME_TYPES.has(mime)) return false
    if (CHAT_ATTACHMENT_TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
      return true
    }
    if (
      CHAT_ATTACHMENT_BINARY_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) &&
      mime !== 'image/svg+xml'
    ) {
      return false
    }
  }

  const ext = chatAttachmentExtension(meta.originalName)
  if (!ext || !isAllowedChatAttachmentName(meta.originalName)) return false
  return !CHAT_ATTACHMENT_BINARY_EXTENSIONS.has(ext)
}

export function formatChatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function sanitizeChatAttachmentFilename(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() ?? 'file'
  const cleaned = base.replace(/[^\w.\-()+ \u0080-\uFFFF]/g, '_').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'file'
}

export function chatUploadsDirForMessage(messageId: string): string {
  return `input/uploads/${messageId.trim()}`
}
