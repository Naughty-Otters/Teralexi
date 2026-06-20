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

const onMock = vi.fn()
const onceMock = vi.fn()
const loginMock = vi.fn().mockResolvedValue('token')
const destroyMock = vi.fn()
const channelsFetchMock = vi.fn()

vi.mock('discord.js', () => ({
  Client: class MockClient {
    on = onMock
    once = onceMock
    login = loginMock
    destroy = destroyMock
    channels = { fetch: channelsFetchMock }
    user = { id: 'bot-123', tag: 'openfdeBot#1234' }
  },
  Events: {
    ClientReady: 'ready',
    MessageCreate: 'messageCreate',
    Error: 'error',
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
  },
}))

describe('DiscordChannelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the discord channel on construction', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    getDiscordChannelManager()
    expect(registerMock).toHaveBeenCalledWith('discord', expect.objectContaining({
      sendToTarget: expect.any(Function),
    }))
  })

  it('returns idle state when no token configured', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    const state = manager.getState()
    expect(state.status).toBe('idle')
    expect(state.botToken).toBe('')
    expect(state.botUsername).toBeNull()
  })

  it('masks token in getState()', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    await manager.setBotToken('MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.ABCDEF')
    const state = manager.getState()
    expect(state.botToken).toMatch(/^MTIz.*CDEF$/)
    expect(state.botToken).not.toBe('MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.ABCDEF')
  })

  it('setBotName persists and returns updated state', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    const state = manager.setBotName('My Discord Bot')
    expect(state.botName).toBe('My Discord Bot')
  })

  it('defaults empty bot name', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    const state = manager.setBotName('  ')
    expect(state.botName).toBe('OpenFDE Discord Bot')
  })

  it('setBotToken starts the bot and calls login', async () => {
    vi.resetModules()

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    const state = await manager.setBotToken('MTIz.abc.def')
    expect(loginMock).toHaveBeenCalledWith('MTIz.abc.def')
    expect(state.status).toBe('connected')
    expect(state.botUsername).toBe('openfdeBot#1234')
  })

  it('stop() disconnects the bot', async () => {
    vi.resetModules()

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await manager.setBotToken('MTIz.abc.def')
    const state = await manager.stop()
    expect(state.status).toBe('disconnected')
    expect(destroyMock).toHaveBeenCalled()
  })

  it('ensureStarted() is a no-op without a token', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await manager.ensureStarted()
    expect(manager.getState().status).toBe('idle')
  })

  it('sendMessageToChannel sends via client', async () => {
    vi.resetModules()

    const sendMock = vi.fn().mockResolvedValue({})
    channelsFetchMock.mockResolvedValue({
      isTextBased: () => true,
      send: sendMock,
    })

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await manager.setBotToken('MTIz.abc.def')
    const messages = await manager.sendMessageToChannel('12345', 'hello')
    expect(sendMock).toHaveBeenCalledWith('hello')
    expect(messages).toHaveLength(1)
    expect(messages[0].fromMe).toBe(true)
  })

  it('sendMessageToChannel throws when bot not connected', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await expect(
      manager.sendMessageToChannel('12345', 'hello'),
    ).rejects.toThrow('Discord bot is not connected')
  })

  it('getChatMessages returns empty initially', async () => {
    vi.resetModules()
    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('handles incoming message via messageCreate callback', async () => {
    vi.resetModules()

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await manager.setBotToken('MTIz.abc.def')

    const messageHandler = onMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'messageCreate',
    )?.[1]
    expect(messageHandler).toBeDefined()

    const message = {
      content: 'Hello bot',
      id: '42',
      channelId: 'ch-99999',
      author: { id: '11111', bot: false },
      createdTimestamp: Date.now(),
      createdAt: new Date(),
    }

    await messageHandler(message)

    expect(onIncomingMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'discord',
        senderId: '11111',
        senderTarget: 'ch-99999',
        text: 'Hello bot',
      }),
    )

    const messages = manager.getChatMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello bot')
    expect(messages[0].fromMe).toBe(false)
  })

  it('ignores bot messages', async () => {
    vi.resetModules()

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await manager.setBotToken('MTIz.abc.def')

    const messageHandler = onMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'messageCreate',
    )?.[1]

    const botMessage = {
      content: 'I am a bot',
      id: '43',
      channelId: 'ch-99999',
      author: { id: '22222', bot: true },
      createdTimestamp: Date.now(),
      createdAt: new Date(),
    }

    await messageHandler(botMessage)
    expect(onIncomingMessageMock).not.toHaveBeenCalled()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('sendMessageToChannel ignores empty inputs', async () => {
    vi.resetModules()

    loginMock.mockImplementationOnce(async () => {
      const readyHandler = onceMock.mock.calls.find(
        (c: unknown[]) => c[0] === 'ready',
      )?.[1]
      readyHandler?.({ user: { id: 'bot-123', tag: 'openfdeBot#1234' } })
      return 'token'
    })

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()
    await manager.setBotToken('MTIz.abc.def')
    const msgs = await manager.sendMessageToChannel('', 'hello')
    expect(msgs).toEqual([])
    expect(channelsFetchMock).not.toHaveBeenCalled()
  })

  it('sets error state when login fails', async () => {
    vi.resetModules()
    loginMock.mockRejectedValueOnce(new Error('Invalid token'))

    const { getDiscordChannelManager } = await import('./manager')
    const manager = getDiscordChannelManager()

    await expect(manager.setBotToken('bad-token')).resolves.toBeDefined()
    const state = manager.getState()
    expect(state.status).toBe('error')
    expect(state.lastError).toBe('Invalid token')
  })
})
