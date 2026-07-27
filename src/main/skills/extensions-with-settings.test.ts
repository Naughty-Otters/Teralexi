import { describe, expect, it, vi, beforeEach } from 'vitest'

const { getExtensionEnabledMock, listExtensionsMock, listPendingHookReviewsMock } =
  vi.hoisted(() => ({
    getExtensionEnabledMock: vi.fn(() => true),
    listExtensionsMock: vi.fn(() => []),
    listPendingHookReviewsMock: vi.fn(async () => []),
  }))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({ getExtensionEnabled: getExtensionEnabledMock }),
}))

vi.mock('./extensions-directory-loader', () => ({
  listExtensions: listExtensionsMock,
}))

vi.mock('./extension-host', () => ({
  listPendingHookReviews: listPendingHookReviewsMock,
}))

import { listExtensionsForUser } from './extensions-with-settings'

describe('listExtensionsForUser', () => {
  beforeEach(() => {
    getExtensionEnabledMock.mockReset().mockReturnValue(true)
    listExtensionsMock.mockReset().mockReturnValue([])
    listPendingHookReviewsMock.mockReset().mockResolvedValue([])
  })

  it('returns an empty array when no extensions are discovered', async () => {
    await expect(listExtensionsForUser('default')).resolves.toEqual([])
  })

  it('merges the enabled flag and extension source', async () => {
    listExtensionsMock.mockReturnValue([
      {
        id: 'secret-guard',
        dir: '/repo/extensions/secret-guard',
        source: 'bundled',
        manifest: {
          id: 'secret-guard',
          version: '1.0.0',
          permissions: { filesystem: 'workspace' },
          activationEvents: ['onStartup'],
          contributes: {
            hooks: { beforeToolCall: [{ type: 'command', command: 'x' }] },
          },
        },
      },
    ])
    getExtensionEnabledMock.mockReturnValue(false)
    listPendingHookReviewsMock.mockResolvedValue([
      {
        extensionId: 'secret-guard',
        trustKey: 'k1',
        contentHash: 'h1',
        sourcePath: 'hooks/hooks.json',
        events: ['beforeToolCall'],
        status: 'pending',
      },
    ])

    const result = await listExtensionsForUser('default')
    expect(result).toEqual([
      {
        id: 'secret-guard',
        version: '1.0.0',
        permissions: { filesystem: 'workspace' },
        activationEvents: ['onStartup'],
        hookEvents: ['beforeToolCall'],
        enabled: false,
        source: 'bundled',
        pendingHookReviews: 1,
      },
    ])
  })
})
