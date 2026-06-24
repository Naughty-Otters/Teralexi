import { describe, expect, it } from 'vitest'
import {
  chatUploadsDirForMessage,
  formatChatAttachmentSize,
  isAllowedChatAttachmentName,
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
})
