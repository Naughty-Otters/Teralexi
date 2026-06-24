import { describe, expect, it, vi, beforeEach } from 'vitest'

const messageExistsMock = vi.fn()
const insertMessageAttachmentsMock = vi.fn()
const getMessageAttachmentsForMessageMock = vi.fn(() => [])

vi.mock('@main/agent/sandbox/registry', () => ({
  getOrCreateSandboxForConversation: vi.fn(async () => ({
    layout: { root: '/tmp/sandbox-root' },
  })),
}))

vi.mock('fs/promises', () => ({
  lstat: vi.fn(async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 10 })),
  mkdir: vi.fn(async () => undefined),
  copyFile: vi.fn(async () => undefined),
  access: vi.fn(async () => undefined),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    messageExists: messageExistsMock,
    insertMessageAttachments: insertMessageAttachmentsMock,
    getMessageAttachmentsForMessage: getMessageAttachmentsForMessageMock,
  }),
}))

import { resolveUserAttachmentsForTurn } from './chat-attachments'

describe('resolveUserAttachmentsForTurn', () => {
  beforeEach(() => {
    messageExistsMock.mockReset()
    insertMessageAttachmentsMock.mockReset()
    getMessageAttachmentsForMessageMock.mockReset()
    getMessageAttachmentsForMessageMock.mockReturnValue([])
  })

  it('returns pre-ingested attachments without touching the store', async () => {
    const attachments = [
      {
        id: 'a1',
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sandboxPath: 'input/uploads/msg-1/notes.txt',
        messageId: 'msg-1',
      },
    ]
    const result = await resolveUserAttachmentsForTurn({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      userAttachments: attachments,
      attachmentSourcePaths: ['/tmp/notes.txt'],
    })
    expect(result.attachments).toEqual(attachments)
    expect(messageExistsMock).not.toHaveBeenCalled()
  })

  it('fails ingest when the user message row is missing', async () => {
    messageExistsMock.mockReturnValue(false)
    const result = await resolveUserAttachmentsForTurn({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachmentSourcePaths: ['/tmp/notes.txt'],
    })
    expect(result.error).toContain('User message must be saved')
    expect(insertMessageAttachmentsMock).not.toHaveBeenCalled()
  })
})
