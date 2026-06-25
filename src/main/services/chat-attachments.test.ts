import { describe, expect, it, vi, beforeEach } from 'vitest'

const messageExistsMock = vi.fn()
const insertMessageAttachmentsMock = vi.fn()
const getMessageAttachmentsForMessageMock = vi.fn(() => [])

vi.mock('@main/agent/sandbox/registry', () => ({
  getOrCreateSandboxForConversation: vi.fn(async () => ({
    layout: { root: '/tmp/sandbox-root' },
  })),
  resolveSandboxRootForConversation: vi.fn(() => '/tmp/sandbox-root'),
}))

const readFileMock = vi.fn()

vi.mock('fs/promises', () => ({
  lstat: vi.fn(async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 10 })),
  mkdir: vi.fn(async () => undefined),
  copyFile: vi.fn(async () => undefined),
  access: vi.fn(async () => undefined),
  readFile: (...args: unknown[]) => readFileMock(...args),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    messageExists: messageExistsMock,
    insertMessageAttachments: insertMessageAttachmentsMock,
    getMessageAttachmentsForMessage: getMessageAttachmentsForMessageMock,
  }),
}))

vi.mock('@main/agent/utils', () => ({
  extractLastUserForPersistence: vi.fn(() => null),
  parseClientUiMessages: vi.fn((messages: unknown[]) => messages),
}))

import {
  ensureUserAttachmentsUploadedBeforeAgentRun,
  readTextChatAttachmentContent,
  resolveUserAttachmentsForTurn,
} from './chat-attachments'
import { extractLastUserForPersistence } from '@main/agent/utils'

describe('ensureUserAttachmentsUploadedBeforeAgentRun', () => {
  beforeEach(() => {
    messageExistsMock.mockReset()
    insertMessageAttachmentsMock.mockReset()
    getMessageAttachmentsForMessageMock.mockReset()
    getMessageAttachmentsForMessageMock.mockReturnValue([])
    vi.mocked(extractLastUserForPersistence).mockReturnValue(null)
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
    const result = await ensureUserAttachmentsUploadedBeforeAgentRun({
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
    const result = await ensureUserAttachmentsUploadedBeforeAgentRun({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachmentSourcePaths: ['/tmp/notes.txt'],
    })
    expect(result.error).toContain('User message must be saved')
    expect(insertMessageAttachmentsMock).not.toHaveBeenCalled()
  })

  it('resolves message id from uiMessages when pending id is absent', async () => {
    messageExistsMock.mockReturnValue(true)
    vi.mocked(extractLastUserForPersistence).mockReturnValue({
      id: 'msg-ui',
      content: 'Attached 1 file',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const result = await ensureUserAttachmentsUploadedBeforeAgentRun({
      conversationId: 'conv-1',
      uiMessages: [{ id: 'msg-ui', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      attachmentSourcePaths: ['/tmp/notes.txt'],
    })
    expect(result.error).toBeUndefined()
    expect(insertMessageAttachmentsMock).toHaveBeenCalled()
  })

  it('resolveUserAttachmentsForTurn delegates to ensure helper', async () => {
    messageExistsMock.mockReturnValue(true)
    const delegated = await resolveUserAttachmentsForTurn({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachmentSourcePaths: ['/tmp/notes.txt'],
    })
    expect(delegated.error).toBeUndefined()
    expect(insertMessageAttachmentsMock).toHaveBeenCalled()
  })
})

describe('readTextChatAttachmentContent', () => {
  beforeEach(() => {
    readFileMock.mockReset()
  })

  it('reads utf-8 text attachments from the sandbox', async () => {
    readFileMock.mockResolvedValue(Buffer.from('hello world'))
    const text = await readTextChatAttachmentContent({
      conversationId: 'conv-1',
      attachment: {
        id: 'a1',
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 11,
        sandboxPath: 'input/uploads/msg-1/notes.txt',
      },
    })
    expect(text).toBe('hello world')
    expect(readFileMock).toHaveBeenCalled()
  })

  it('skips binary attachments', async () => {
    const text = await readTextChatAttachmentContent({
      conversationId: 'conv-1',
      attachment: {
        id: 'a2',
        originalName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 100,
        sandboxPath: 'input/uploads/msg-1/photo.png',
      },
    })
    expect(text).toBeNull()
    expect(readFileMock).not.toHaveBeenCalled()
  })
})
