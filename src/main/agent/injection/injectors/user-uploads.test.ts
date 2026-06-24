import { describe, expect, it } from 'vitest'
import {
  formatUserUploadsInstructionBlock,
  userUploadsInjector,
} from './user-uploads'

describe('userUploadsInjector', () => {
  it('formats attachment paths for the model', () => {
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

  it('applies when user attachments are present', () => {
    expect(
      userUploadsInjector.applies({
        ctx: {
          opts: {
            userAttachments: [
              {
                id: 'a1',
                originalName: 'notes.txt',
                mimeType: 'text/plain',
                sizeBytes: 1,
                sandboxPath: 'input/uploads/msg-1/notes.txt',
              },
            ],
          },
        },
      } as never),
    ).toBe(true)
  })
})
