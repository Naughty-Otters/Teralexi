import type { ProviderType } from '@shared/agent/llm-provider-registry'
import {
  chatAttachmentExtension,
  type ChatAttachmentMeta,
} from '@shared/chat/attachments'

/** Media types we send as native AI SDK file parts (vision / document). */
const NATIVE_MULTIMODAL_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

const NATIVE_MULTIMODAL_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
])

/** Providers that accept native file/image message parts well. */
const NATIVE_FILE_PART_PROVIDERS = new Set<ProviderType>([
  'openai',
  'anthropic',
  'gemini',
  'xai',
  'openrouter',
])

/** Providers with AI SDK `files()` / `uploadFile` support. */
const UPLOAD_FILE_PROVIDERS = new Set<ProviderType>([
  'openai',
  'anthropic',
  'gemini',
  'xai',
])

export function isNativeMultimodalAttachment(
  meta: Pick<ChatAttachmentMeta, 'originalName' | 'mimeType'>,
): boolean {
  const mime = meta.mimeType?.trim().toLowerCase()
  if (mime && NATIVE_MULTIMODAL_MIME_TYPES.has(mime)) return true
  const ext = chatAttachmentExtension(meta.originalName)
  return NATIVE_MULTIMODAL_EXTENSIONS.has(ext)
}

export function providerSupportsNativeFileParts(provider: ProviderType): boolean {
  return NATIVE_FILE_PART_PROVIDERS.has(provider)
}

export function providerSupportsUploadFile(provider: ProviderType): boolean {
  return UPLOAD_FILE_PROVIDERS.has(provider)
}

export function resolveAttachmentMediaType(
  meta: Pick<ChatAttachmentMeta, 'originalName' | 'mimeType'>,
): string {
  const mime = meta.mimeType?.trim().toLowerCase()
  if (mime) return mime
  const ext = chatAttachmentExtension(meta.originalName)
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}
