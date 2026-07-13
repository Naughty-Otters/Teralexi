import { beforeEach, describe, expect, it, vi } from 'vitest'

const { followUpsChanged } = vi.hoisted(() => ({
  followUpsChanged: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: {} }],
  },
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    ConversationFollowUpsChanged: followUpsChanged,
  },
}))

import { notifyConversationFollowUpsChanged } from './follow-up-notify'

describe('notifyConversationFollowUpsChanged', () => {
  beforeEach(() => {
    followUpsChanged.mockClear()
  })

  it('broadcasts follow-ups to renderer windows', () => {
    notifyConversationFollowUpsChanged('conv-1', [
      {
        id: 'a',
        label: 'Next',
        action: { type: 'user_input', message: 'next' },
      },
    ])
    expect(followUpsChanged).toHaveBeenCalledWith(
      {},
      {
        conversationId: 'conv-1',
        followUps: [
          {
            id: 'a',
            label: 'Next',
            action: { type: 'user_input', message: 'next' },
          },
        ],
      },
    )
  })

  it('ignores blank conversation ids', () => {
    notifyConversationFollowUpsChanged('  ', [])
    expect(followUpsChanged).not.toHaveBeenCalled()
  })
})
