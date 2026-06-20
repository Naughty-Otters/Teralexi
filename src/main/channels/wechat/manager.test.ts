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

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function mockTokenSuccess() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      errcode: 0,
      errmsg: 'ok',
      access_token: 'test-access-token-123',
      expires_in: 7200,
    }),
  })
}

function mockSendSuccess() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      errcode: 0,
      errmsg: 'ok',
    }),
  })
}

describe('WeChatChannelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configStore.clear()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the wechat channel on construction', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    getWeChatChannelManager()
    expect(registerMock).toHaveBeenCalledWith('wechat', expect.objectContaining({
      sendToTarget: expect.any(Function),
    }))
  })

  it('returns idle state when no credentials configured', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    const state = manager.getState()
    expect(state.status).toBe('idle')
    expect(state.corpId).toBe('')
    expect(state.agentId).toBe('')
  })

  it('setBotName persists and returns updated state', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    const state = manager.setBotName('My WeChat Bot')
    expect(state.botName).toBe('My WeChat Bot')
  })

  it('defaults empty bot name', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    const state = manager.setBotName('  ')
    expect(state.botName).toBe('OpenFDE WeChat Bot')
  })

  it('setCredentials starts the bot when corpId and corpSecret provided', async () => {
    vi.resetModules()
    mockTokenSuccess()

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    const state = await manager.setCredentials({
      corpId: 'ww123456',
      corpSecret: 'secret-abc',
      agentId: '1000002',
    })

    expect(state.status).toBe('connected')
    expect(state.corpId).toBe('ww123456')
    expect(state.agentId).toBe('1000002')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('setCredentials stays idle when corpSecret is missing', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    const state = await manager.setCredentials({
      corpId: 'ww123456',
      agentId: '1000002',
    })
    expect(state.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stop() disconnects the bot', async () => {
    vi.resetModules()
    mockTokenSuccess()

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    await manager.setCredentials({
      corpId: 'ww123456',
      corpSecret: 'secret-abc',
    })
    const state = await manager.stop()
    expect(state.status).toBe('disconnected')
  })

  it('ensureStarted() is a no-op without credentials', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    await manager.ensureStarted()
    expect(manager.getState().status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sendMessageToUser sends via WeChat API', async () => {
    vi.resetModules()
    mockTokenSuccess()

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    await manager.setCredentials({
      corpId: 'ww123456',
      corpSecret: 'secret-abc',
      agentId: '1000002',
    })

    mockSendSuccess()
    const messages = await manager.sendMessageToUser('user-001', 'hello')
    expect(messages).toHaveLength(1)
    expect(messages[0].fromMe).toBe(true)
    expect(messages[0].text).toBe('hello')

    const sendCall = fetchMock.mock.calls[1]
    expect(sendCall[0]).toContain('message/send')
    const body = JSON.parse(sendCall[1].body)
    expect(body.touser).toBe('user-001')
    expect(body.text.content).toBe('hello')
  })

  it('sendMessageToUser throws when bot not connected', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    await expect(
      manager.sendMessageToUser('user-001', 'hello'),
    ).rejects.toThrow('WeChat bot is not connected')
  })

  it('sendMessageToUser ignores empty inputs', async () => {
    vi.resetModules()
    mockTokenSuccess()

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    await manager.setCredentials({
      corpId: 'ww123456',
      corpSecret: 'secret-abc',
    })

    const msgs = await manager.sendMessageToUser('', 'hello')
    expect(msgs).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1) // only token call
  })

  it('getChatMessages returns empty initially', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('handleIncomingWebhook stores message and bridges to agent', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()

    manager.handleIncomingWebhook({
      fromUser: 'user-001',
      text: 'Hello from WeChat',
      msgId: 'msg-42',
      createTime: Math.floor(Date.now() / 1000),
    })

    expect(onIncomingMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'wechat',
        senderId: 'user-001',
        senderTarget: 'user-001',
        text: 'Hello from WeChat',
      }),
    )

    const messages = manager.getChatMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello from WeChat')
    expect(messages[0].fromMe).toBe(false)
  })

  it('handleIncomingWebhook ignores empty text', async () => {
    vi.resetModules()
    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()

    manager.handleIncomingWebhook({
      fromUser: 'user-001',
      text: '',
      msgId: 'msg-43',
      createTime: Math.floor(Date.now() / 1000),
    })

    expect(onIncomingMessageMock).not.toHaveBeenCalled()
    expect(manager.getChatMessages()).toEqual([])
  })

  it('sets error state when token fetch fails', async () => {
    vi.resetModules()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errcode: 40013,
        errmsg: 'invalid corpid',
      }),
    })

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()

    await expect(
      manager.setCredentials({
        corpId: 'bad-id',
        corpSecret: 'bad-secret',
      }),
    ).resolves.toBeDefined()

    const state = manager.getState()
    expect(state.status).toBe('error')
    expect(state.lastError).toContain('40013')
  })

  it('sets error state on HTTP failure', async () => {
    vi.resetModules()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()

    await expect(
      manager.setCredentials({
        corpId: 'ww123456',
        corpSecret: 'secret-abc',
      }),
    ).resolves.toBeDefined()

    const state = manager.getState()
    expect(state.status).toBe('error')
    expect(state.lastError).toContain('HTTP 500')
  })

  it('sendMessageToUser throws on API error response', async () => {
    vi.resetModules()
    mockTokenSuccess()

    const { getWeChatChannelManager } = await import('./manager')
    const manager = getWeChatChannelManager()
    await manager.setCredentials({
      corpId: 'ww123456',
      corpSecret: 'secret-abc',
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errcode: 81013,
        errmsg: 'user not found',
      }),
    })

    await expect(
      manager.sendMessageToUser('bad-user', 'hello'),
    ).rejects.toThrow('WeChat API error 81013')
  })
})
