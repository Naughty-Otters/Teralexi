import { describe, expect, it } from 'vitest'
import {
  isNativeMultimodalAttachment,
  providerSupportsNativeFileParts,
  providerSupportsUploadFile,
  resolveAttachmentMediaType,
} from './multimodal-attachments'

describe('multimodal-attachments', () => {
  it('detects image/pdf attachments', () => {
    expect(
      isNativeMultimodalAttachment({
        originalName: 'shot.png',
        mimeType: 'image/png',
      }),
    ).toBe(true)
    expect(
      isNativeMultimodalAttachment({
        originalName: 'doc.pdf',
        mimeType: null,
      }),
    ).toBe(true)
    expect(
      isNativeMultimodalAttachment({
        originalName: 'notes.txt',
        mimeType: 'text/plain',
      }),
    ).toBe(false)
  })

  it('gates providers for native parts and uploadFile', () => {
    expect(providerSupportsNativeFileParts('openai')).toBe(true)
    expect(providerSupportsNativeFileParts('ollama')).toBe(false)
    expect(providerSupportsUploadFile('anthropic')).toBe(true)
    expect(providerSupportsUploadFile('openrouter')).toBe(false)
  })

  it('resolves media types from extension fallback', () => {
    expect(
      resolveAttachmentMediaType({ originalName: 'a.jpeg', mimeType: null }),
    ).toBe('image/jpeg')
  })
})
