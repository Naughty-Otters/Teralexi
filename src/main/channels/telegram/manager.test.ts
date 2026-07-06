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

const getMeMock = vi.fn().mockResolvedValue({ username: 'teralexi_bot' })
const sendMessageMock = vi.fn().mockResolvedValue({})
const onMock = vi.fn()
const startMock = vi.fn().mockImplementation(function (
  this: unknown,
  opts?: { onStart?: () => void },
) {
  opts?.onStart?.()
  return new Promise<void>(() => {
    // Long polling loop — intentionally never resolves in tests
  })
})
const stopMock = vi.fn()
const catchMock = vi.fn()

vi.mock('grammy', () => ({
  Bot: class MockBot {
    on = onMock
    catch = catchMock
    start = startMock
    stop = stopMock
    api = {
      getMe: getMeMock,
      sendMessage: sendMessageMock,
    }
  },
}))

describe('TelegramChannelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the telegram channel on construction', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    getTelegramChannelManager()
    expect(registerMock).toHaveBeenCalledWith('telegram', expect.objectContaining({
      sendToTarget: expect.any(Function),
    }))
  })

  it('returns idle state when no token configured', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    const state = manager.getState()
    expect(state.status).toBe('idle')
    expect(state.botToken).toBe('')
    expect(state.botUsername).toBeNull()
  })

  it('masks token in getState()', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.setBotToken('1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    const state = manager.getState()
    expect(state.botToken).toMatch(/^1234.*WXYZ$/)
    expect(state.botToken).not.toBe('1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })

  it('setBotName persists and returns updated state', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    const state = manager.setBotName('My Bot')
    expect(state.botName).toBe('My Bot')
  })

  it('defaults empty bot name', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    const state = manager.setBotName('  ')
    expect(state.botName).toBe('Teralexi Telegram Bot')
  })

  it('setBotToken starts the bot and returns connected state', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    const state = await manager.setBotToken('123:ABC')
    expect(state.status).toBe('connected')
  })

  it('setBotToken ignores masked token from UI and keeps stored secret', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.setBotToken('1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    getMeMock.mockClear()
    startMock.mockClear()

    const state = await manager.setBotToken('1234••••WXYZ')

    expect(state.status).toBe('connected')
    expect(getMeMock).not.toHaveBeenCalled()
    expect(startMock).not.toHaveBeenCalled()
  })

  it('setBotToken rejects invalid token format without calling Telegram API', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    getMeMock.mockClear()

    const state = await manager.setBotToken('not-a-valid-token')

    expect(state.status).toBe('error')
    expect(state.lastError).toContain('Invalid bot token')
    expect(getMeMock).not.toHaveBeenCalled()
  })

  it('stop() disconnects the bot', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.setBotToken('123:ABC')
    const state = await manager.stop()
    expect(state.status).toBe('disconnected')
    expect(stopMock).toHaveBeenCalled()
  })

  it('ensureStarted() is a no-op without a token', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.ensureStarted()
    expect(manager.getState().status).toBe('idle')
  })

  it('sendMessageToChatId sends via bot API', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.setBotToken('123:ABC')
    const messages = await manager.sendMessageToChatId('12345', 'hello')
    expect(sendMessageMock).toHaveBeenCalledWith('12345', 'hello')
    expect(messages).toHaveLength(1)
    expect(messages[0].fromMe).toBe(true)
  })

  it('sendMessageToChatId throws when bot not connected', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await expect(
      manager.sendMessageToChatId('12345', 'hello'),
    ).rejects.toThrow('Telegram bot is not connected')
  })

  it('getChatMessages returns empty initially', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('handles incoming text message via bot.on callback', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.setBotToken('123:ABC')

    const messageHandler = onMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'message:text',
    )?.[1]
    expect(messageHandler).toBeDefined()

    const ctx = {
      message: {
        text: 'Hello bot',
        message_id: 42,
        date: Math.floor(Date.now() / 1000),
      },
      chat: { id: 99999 },
      from: { id: 11111, first_name: 'Alice', username: 'alice' },
    }

    await messageHandler(ctx)

    expect(onIncomingMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'telegram',
        senderId: '11111',
        senderTarget: '99999',
        text: 'Hello bot',
      }),
    )

    const messages = manager.getChatMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello bot')
    expect(messages[0].fromMe).toBe(false)
  })

  it('sendMessageToChatId ignores empty inputs', async () => {
    vi.resetModules()
    const { getTelegramChannelManager } = await import('./manager')
    const manager = getTelegramChannelManager()
    await manager.setBotToken('123:ABC')
    const msgs = await manager.sendMessageToChatId('', 'hello')
    expect(msgs).toEqual([])
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})
