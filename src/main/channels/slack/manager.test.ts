import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registerMock = vi.fn()
const onIncomingMessageMock = vi.fn()

const configStore = new Map<string, string>()

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn((key: string, def = '') => configStore.get(key) ?? def),
  setSystemPropValue: vi.fn((key: string, value: string) => {
    configStore.set(key, value)
  }),
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: () => ({ register: registerMock }),
}))

vi.mock('@main/channels/framework/conversation-bridge', () => ({
  getChannelConversationBridge: () => ({
    onIncomingMessage: onIncomingMessageMock,
  }),
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    raw: { child: () => ({ level: 'warn' }) },
  }),
}))

const messageMock = vi.fn()
const startMock = vi.fn().mockResolvedValue(undefined)
const stopMock = vi.fn().mockResolvedValue(undefined)
const postMessageMock = vi.fn().mockResolvedValue({ ok: true })
const authTestMock = vi.fn().mockResolvedValue({ user_id: 'U_BOT_123' })

vi.mock('@slack/bolt', () => ({
  App: class MockApp {
    message = messageMock
    start = startMock
    stop = stopMock
    client = {
      chat: { postMessage: postMessageMock },
      auth: { test: authTestMock },
    }
  },
}))

describe('SlackChannelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the slack channel on construction', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    getSlackChannelManager()
    expect(registerMock).toHaveBeenCalledWith('slack', expect.objectContaining({
      sendToTarget: expect.any(Function),
    }))
  })

  it('returns idle state when no tokens configured', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    const state = manager.getState()
    expect(state.status).toBe('idle')
    expect(state.botToken).toBe('')
    expect(state.appToken).toBe('')
    expect(state.botUserId).toBeNull()
  })

  it('masks tokens in getState()', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()

    await manager.setTokens({
      botToken: 'xoxb-1234567890-abcdefghij',
      appToken: 'xapp-1-A0B1C2D3E4-9876543210-xyz',
    })

    const state = manager.getState()
    expect(state.botToken).toMatch(/^xoxb-1.*ghij$/)
    expect(state.botToken).not.toBe('xoxb-1234567890-abcdefghij')
    expect(state.appToken).toMatch(/^xapp-1.*-xyz$/)
  })

  it('setBotName persists and returns updated state', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    const state = manager.setBotName('My Slack Bot')
    expect(state.botName).toBe('My Slack Bot')
  })

  it('defaults empty bot name', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    const state = manager.setBotName('  ')
    expect(state.botName).toBe('OpenFDE Slack Bot')
  })

  it('setTokens starts the bot and calls app.start()', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()

    const state = await manager.setTokens({
      botToken: 'xoxb-token',
      appToken: 'xapp-token',
    })

    expect(startMock).toHaveBeenCalled()
    expect(authTestMock).toHaveBeenCalled()
    expect(state.status).toBe('connected')
    expect(state.botUserId).toBe('U_BOT_123')
  })

  it('stays idle when only botToken is provided', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    const state = await manager.setTokens({ botToken: 'xoxb-token' })
    expect(state.status).toBe('idle')
    expect(startMock).not.toHaveBeenCalled()
  })

  it('stop() disconnects the bot', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await manager.setTokens({ botToken: 'xoxb-tok', appToken: 'xapp-tok' })
    const state = await manager.stop()
    expect(state.status).toBe('disconnected')
    expect(stopMock).toHaveBeenCalled()
  })

  it('ensureStarted() is a no-op without tokens', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await manager.ensureStarted()
    expect(manager.getState().status).toBe('idle')
  })

  it('sendMessageToChannel sends via Slack API', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await manager.setTokens({ botToken: 'xoxb-tok', appToken: 'xapp-tok' })

    const messages = await manager.sendMessageToChannel('C012345', 'hello')
    expect(postMessageMock).toHaveBeenCalledWith({
      channel: 'C012345',
      text: 'hello',
    })
    expect(messages).toHaveLength(1)
    expect(messages[0].fromMe).toBe(true)
  })

  it('sendMessageToChannel throws when bot not connected', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await expect(
      manager.sendMessageToChannel('C012345', 'hello'),
    ).rejects.toThrow('Slack bot is not connected')
  })

  it('getChatMessages returns empty initially', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('handles incoming message via app.message callback', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await manager.setTokens({ botToken: 'xoxb-tok', appToken: 'xapp-tok' })

    const messageHandler = messageMock.mock.calls[0]?.[0]
    expect(messageHandler).toBeDefined()

    const ctx = {
      message: {
        text: 'Hello bot',
        user: 'U_USER_456',
        channel: 'C_CHAN_789',
        ts: String(Date.now() / 1000),
      },
      say: vi.fn(),
    }

    await messageHandler(ctx)

    expect(onIncomingMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'slack',
        senderId: 'U_USER_456',
        senderTarget: 'C_CHAN_789',
        text: 'Hello bot',
      }),
    )

    const messages = manager.getChatMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello bot')
    expect(messages[0].fromMe).toBe(false)
  })

  it('ignores messages with subtypes', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await manager.setTokens({ botToken: 'xoxb-tok', appToken: 'xapp-tok' })

    const messageHandler = messageMock.mock.calls[0]?.[0]

    const ctx = {
      message: {
        subtype: 'channel_join',
        text: 'joined channel',
        user: 'U_USER_456',
        channel: 'C_CHAN_789',
        ts: String(Date.now() / 1000),
      },
      say: vi.fn(),
    }

    await messageHandler(ctx)
    expect(onIncomingMessageMock).not.toHaveBeenCalled()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('sendMessageToChannel ignores empty inputs', async () => {
    vi.resetModules()
    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()
    await manager.setTokens({ botToken: 'xoxb-tok', appToken: 'xapp-tok' })
    const msgs = await manager.sendMessageToChannel('', 'hello')
    expect(msgs).toEqual([])
    expect(postMessageMock).not.toHaveBeenCalled()
  })

  it('sets error state when start fails', async () => {
    vi.resetModules()
    startMock.mockRejectedValueOnce(new Error('invalid_auth'))

    const { getSlackChannelManager } = await import('./manager')
    const manager = getSlackChannelManager()

    await expect(
      manager.setTokens({ botToken: 'bad', appToken: 'bad' }),
    ).resolves.toBeDefined()

    const state = manager.getState()
    expect(state.status).toBe('error')
    expect(state.lastError).toBe('invalid_auth')
  })
})
