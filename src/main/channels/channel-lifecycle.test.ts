import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  isTeralexiTestMode,
  channelManagers,
} = vi.hoisted(() => ({
  isTeralexiTestMode: vi.fn(() => false),
  channelManagers: {
    whatsapp: { ensureStarted: vi.fn(async () => undefined) },
    telegram: { ensureStarted: vi.fn(async () => undefined) },
    discord: { ensureStarted: vi.fn(async () => undefined) },
    wechat: { ensureStarted: vi.fn(async () => undefined) },
    slack: { ensureStarted: vi.fn(async () => undefined) },
  },
}))

vi.mock('@config/test-mode', () => ({
  isTeralexiTestMode,
}))

vi.mock('./whatsapp/manager', () => ({
  getWhatsAppChannelManager: () => channelManagers.whatsapp,
}))
vi.mock('./telegram/manager', () => ({
  getTelegramChannelManager: () => channelManagers.telegram,
}))
vi.mock('./discord/manager', () => ({
  getDiscordChannelManager: () => channelManagers.discord,
}))
vi.mock('./wechat/manager', () => ({
  getWeChatChannelManager: () => channelManagers.wechat,
}))
vi.mock('./slack/manager', () => ({
  getSlackChannelManager: () => channelManagers.slack,
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  ensureBuiltinChannelManagersStarted,
  resetBuiltinChannelManagersForTests,
} from './channel-lifecycle'

describe('ensureBuiltinChannelManagersStarted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBuiltinChannelManagersForTests()
    isTeralexiTestMode.mockReturnValue(false)
  })

  afterEach(() => {
    resetBuiltinChannelManagersForTests()
  })

  it('starts all built-in channel managers once', async () => {
    await ensureBuiltinChannelManagersStarted()
    await ensureBuiltinChannelManagersStarted()

    expect(channelManagers.whatsapp.ensureStarted).toHaveBeenCalledTimes(1)
    expect(channelManagers.telegram.ensureStarted).toHaveBeenCalledTimes(1)
    expect(channelManagers.discord.ensureStarted).toHaveBeenCalledTimes(1)
    expect(channelManagers.wechat.ensureStarted).toHaveBeenCalledTimes(1)
    expect(channelManagers.slack.ensureStarted).toHaveBeenCalledTimes(1)
  })

  it('skips startup in test mode', async () => {
    isTeralexiTestMode.mockReturnValue(true)

    await ensureBuiltinChannelManagersStarted()

    expect(channelManagers.whatsapp.ensureStarted).not.toHaveBeenCalled()
  })

  it('retries startup after a previous failure', async () => {
    channelManagers.whatsapp.ensureStarted
      .mockRejectedValueOnce(new Error('startup failed'))
      .mockResolvedValueOnce(undefined)

    await expect(ensureBuiltinChannelManagersStarted()).rejects.toThrow('startup failed')
    await ensureBuiltinChannelManagersStarted()

    expect(channelManagers.whatsapp.ensureStarted).toHaveBeenCalledTimes(2)
  })
})
