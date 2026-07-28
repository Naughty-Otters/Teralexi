import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  getExtensionEnabledMock,
  listExtensionsMock,
  peekPendingHookReviewsMock,
  ensureExtensionHostInitializedMock,
} = vi.hoisted(() => ({
  getExtensionEnabledMock: vi.fn(() => true),
  listExtensionsMock: vi.fn(() => []),
  peekPendingHookReviewsMock: vi.fn(() => null as unknown[] | null),
  ensureExtensionHostInitializedMock: vi.fn(async () => undefined),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({ getExtensionEnabled: getExtensionEnabledMock }),
}))

vi.mock('./extensions-directory-loader', () => ({
  listExtensions: listExtensionsMock,
}))

vi.mock('./extension-host', () => ({
  peekPendingHookReviews: peekPendingHookReviewsMock,
  ensureExtensionHostInitialized: ensureExtensionHostInitializedMock,
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { listExtensionsForUser } from './extensions-with-settings'

describe('listExtensionsForUser', () => {
  beforeEach(() => {
    getExtensionEnabledMock.mockReset().mockReturnValue(true)
    listExtensionsMock.mockReset().mockReturnValue([])
    peekPendingHookReviewsMock.mockReset().mockReturnValue(null)
    ensureExtensionHostInitializedMock.mockReset().mockResolvedValue(undefined)
  })

  it('returns an empty array when no extensions are discovered', async () => {
    await expect(listExtensionsForUser('default')).resolves.toEqual([])
  })

  it('lists extensions without awaiting host rebuild', async () => {
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
        pendingHookReviews: 0,
      },
    ])
    expect(ensureExtensionHostInitializedMock).toHaveBeenCalledWith(
      'default',
      undefined,
    )
  })

  it('merges cached pending review counts when host cache is warm', async () => {
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
    peekPendingHookReviewsMock.mockReturnValue([
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
    expect(result[0]?.pendingHookReviews).toBe(1)
    expect(ensureExtensionHostInitializedMock).not.toHaveBeenCalled()
  })
})
