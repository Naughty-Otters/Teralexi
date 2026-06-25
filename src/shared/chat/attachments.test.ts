import { describe, expect, it } from 'vitest'
import {
  chatUploadsDirForMessage,
  formatChatAttachmentSize,
  isAllowedChatAttachmentName,
  isTextBasedChatAttachment,
  mimeTypeForChatAttachmentName,
  sanitizeChatAttachmentFilename,
} from './attachments'

describe('chat attachments helpers', () => {
  it('validates allowed extensions', () => {
    expect(isAllowedChatAttachmentName('report.pdf')).toBe(true)
    expect(isAllowedChatAttachmentName('notes.txt')).toBe(true)
    expect(isAllowedChatAttachmentName('archive.zip')).toBe(false)
    expect(isAllowedChatAttachmentName('noext')).toBe(false)
  })

  it('resolves mime types from filenames', () => {
    expect(mimeTypeForChatAttachmentName('a.PDF')).toBe('application/pdf')
    expect(mimeTypeForChatAttachmentName('b.unknown')).toBeNull()
  })

  it('sanitizes filenames', () => {
    expect(sanitizeChatAttachmentFilename('../../evil.pdf')).toBe('evil.pdf')
    expect(sanitizeChatAttachmentFilename('')).toBe('file')
  })

  it('formats sizes and upload dirs', () => {
    expect(formatChatAttachmentSize(512)).toBe('512 B')
    expect(formatChatAttachmentSize(2048)).toBe('2.0 KB')
    expect(chatUploadsDirForMessage('msg-1')).toBe('input/uploads/msg-1')
  })

  it('classifies text-based vs binary attachments', () => {
    expect(
      isTextBasedChatAttachment({
        originalName: 'notes.txt',
        mimeType: 'text/plain',
      }),
    ).toBe(true)
    expect(
      isTextBasedChatAttachment({
        originalName: 'data.json',
        mimeType: 'application/json',
      }),
    ).toBe(true)
    expect(
      isTextBasedChatAttachment({
        originalName: 'diagram.svg',
        mimeType: 'image/svg+xml',
      }),
    ).toBe(true)
    expect(
      isTextBasedChatAttachment({
        originalName: 'photo.png',
        mimeType: 'image/png',
      }),
    ).toBe(false)
    expect(
      isTextBasedChatAttachment({
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
      }),
    ).toBe(false)
    expect(
      isTextBasedChatAttachment({
        originalName: 'script.py',
        mimeType: null,
      }),
    ).toBe(true)
  })
})
