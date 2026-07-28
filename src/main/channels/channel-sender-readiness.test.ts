import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  ensureBuiltinChannelManagersStarted,
  ensureExtensionHostInitialized,
} = vi.hoisted(() => ({
  ensureBuiltinChannelManagersStarted: vi.fn(async () => undefined),
  ensureExtensionHostInitialized: vi.fn(async () => undefined),
}))

vi.mock('./channel-lifecycle', () => ({
  ensureBuiltinChannelManagersStarted,
}))

vi.mock('@main/skills/extension-host', () => ({
  ensureExtensionHostInitialized,
}))

import { ensureChannelSenderReady } from './channel-sender-readiness'

describe('ensureChannelSenderReady', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes extension host for extension-scoped channel ids', async () => {
    await ensureChannelSenderReady('user-1', 'demo-channel:log', '/workspace')

    expect(ensureExtensionHostInitialized).toHaveBeenCalledWith(
      'user-1',
      '/workspace',
    )
    expect(ensureBuiltinChannelManagersStarted).not.toHaveBeenCalled()
  })

  it('starts built-in channel managers for non-extension ids', async () => {
    await ensureChannelSenderReady('user-1', 'whatsapp')

    expect(ensureBuiltinChannelManagersStarted).toHaveBeenCalledTimes(1)
    expect(ensureExtensionHostInitialized).not.toHaveBeenCalled()
  })

  it('ignores empty channel ids', async () => {
    await ensureChannelSenderReady('user-1', '   ')

    expect(ensureBuiltinChannelManagersStarted).not.toHaveBeenCalled()
    expect(ensureExtensionHostInitialized).not.toHaveBeenCalled()
  })
})
