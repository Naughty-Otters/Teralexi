import { describe, expect, it } from 'vitest'
import {
  buildUserUploadsInstructionBlock,
  formatUserUploadsInstructionBlock,
  selectAttachmentsForUserTurn,
  userUploadsInjector,
} from './user-uploads'
import { injectUserMessages } from '../pipeline'
import { USER_UPLOADS_INJECTOR_MARKER } from '../injection-message-content'

describe('userUploadsInjector', () => {
  it('inlines text attachments and keeps binary attachments as paths', () => {
    const block = formatUserUploadsInstructionBlock(
      [
        {
          id: 'a1',
          originalName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1200,
          sandboxPath: 'input/uploads/msg-1/notes.txt',
          messageId: 'msg-1',
        },
        {
          id: 'a2',
          originalName: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 2400,
          sandboxPath: 'input/uploads/msg-1/photo.png',
          messageId: 'msg-1',
        },
      ],
      new Map([['input/uploads/msg-1/notes.txt', 'hello from notes']]),
    )
    expect(block).toContain('hello from notes')
    expect(block).toContain('```txt')
    expect(block).toContain('input/uploads/msg-1/photo.png')
    expect(block).not.toContain('hello from notes.png')
  })

  it('falls back to paths when inline text is unavailable', () => {
    const block = formatUserUploadsInstructionBlock([
      {
        id: 'a1',
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 1200,
        sandboxPath: 'input/uploads/msg-1/notes.txt',
        messageId: 'msg-1',
      },
    ])
    expect(block).toContain('input/uploads/msg-1/notes.txt')
    expect(block).toContain('read_file')
  })

  it('scopes attachments to the current user turn', () => {
    const scoped = selectAttachmentsForUserTurn(
      [
        {
          id: 'a1',
          originalName: 'old.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          sandboxPath: 'input/uploads/old/old.txt',
          messageId: 'old-msg',
        },
        {
          id: 'a2',
          originalName: 'new.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          sandboxPath: 'input/uploads/new-msg/new.txt',
          messageId: 'new-msg',
        },
      ],
      'new-msg',
    )
    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.sandboxPath).toContain('new-msg')
  })

  it('applies only on the first tool-loop step when attachments are present', () => {
    const attachments = [
      {
        id: 'a1',
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 1,
        sandboxPath: 'input/uploads/msg-1/notes.txt',
        messageId: 'msg-1',
      },
    ]
    const baseCtx = {
      ctx: {
        opts: {
          userAttachments: attachments,
          pendingUserMessage: { id: 'msg-1', content: 'see file', createdAt: '' },
        },
      },
      loopStep: 0,
      latestUserMessageId: 'msg-1',
    } as never

    expect(userUploadsInjector.applies(baseCtx)).toBe(true)
    expect(userUploadsInjector.applies({ ...baseCtx, loopStep: 1 } as never)).toBe(
      false,
    )
  })

  it('augments the trailing user message with inline text when provided', async () => {
    const block = await buildUserUploadsInstructionBlock(
      [
        {
          id: 'a1',
          originalName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          sandboxPath: 'input/uploads/msg-1/notes.txt',
          messageId: 'msg-1',
        },
      ],
      { conversationId: undefined },
    )
    expect(block).toContain('input/uploads/msg-1/notes.txt')
  })

  it('augments the trailing user message via the injection pipeline', async () => {
    const messages = await injectUserMessages(
      {
        opts: {
          skillId: 'demo',
          conversationId: 'conv-1',
          userAttachments: [
            {
              id: 'a1',
              originalName: 'notes.txt',
              mimeType: 'text/plain',
              sizeBytes: 1,
              sandboxPath: 'input/uploads/msg-1/notes.txt',
              messageId: 'msg-1',
            },
            {
              id: 'a2',
              originalName: 'photo.png',
              mimeType: 'image/png',
              sizeBytes: 1,
              sandboxPath: 'input/uploads/msg-1/photo.png',
              messageId: 'msg-1',
            },
          ],
          pendingUserMessage: {
            id: 'msg-1',
            content: 'Please review the attachment',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        },
        agentRun: { meta: { depth: 0 } },
      } as never,
      [{ role: 'user', content: 'Please review the attachment' }],
      0,
    )

    const userText = String(messages[0]?.content ?? '')
    expect(userText).toContain('Please review the attachment')
    expect(userText).toContain(USER_UPLOADS_INJECTOR_MARKER)
    expect(userText).toContain('input/uploads/msg-1/photo.png')
  })
})
