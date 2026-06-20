import { getSystemPropValue, setSystemPropValue } from '@config/system-prop'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { getChannelConversationBridge } from '@main/channels/framework/conversation-bridge'
import { createLogger } from '@main/logger'

const WECHAT_CORP_ID_KEY = 'settings.wechat.corpId'
const WECHAT_CORP_SECRET_KEY = 'settings.wechat.corpSecret'
const WECHAT_AGENT_ID_KEY = 'settings.wechat.agentId'
const WECHAT_BOT_NAME_KEY = 'settings.wechat.botName'
const DEFAULT_BOT_NAME = 'OpenFDE WeChat Bot'
const DEFAULT_WECHAT_AGENT_ID = 'skill:default'
const CHANNEL_ID = 'wechat'
const TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken'
const SEND_URL = 'https://qyapi.weixin.qq.com/cgi-bin/message/send'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

const log = createLogger('channels.wechat.manager')

export type WeChatConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface WeChatState {
  botName: string
  corpId: string
  agentId: string
  status: WeChatConnectionStatus
  lastError: string | null
}

export interface WeChatChatMessage {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

interface AccessTokenResponse {
  errcode: number
  errmsg: string
  access_token?: string
  expires_in?: number
}

interface SendMessageResponse {
  errcode: number
  errmsg: string
}

class WeChatChannelManager {
  private accessToken: string | null = null
  private tokenExpiresAt = 0
  private bootPromise: Promise<void> | null = null
  private chatMessages: WeChatChatMessage[] = []
  private started = false

  constructor() {
    getChannelRegistry().register(CHANNEL_ID, {
      sendToTarget: async (target, text) => {
        await this.sendMessageToUser(target, text)
      },
    })
  }

  private state: WeChatState = {
    botName: this.readBotName(),
    corpId: this.readCorpId(),
    agentId: this.readAgentId(),
    status: 'idle',
    lastError: null,
  }

  getState(): WeChatState {
    return {
      ...this.state,
    }
  }

  setBotName(botName: string): WeChatState {
    const normalized = botName.trim() || DEFAULT_BOT_NAME
    setSystemPropValue(WECHAT_BOT_NAME_KEY, normalized)
    this.state.botName = normalized
    return this.getState()
  }

  async setCredentials(opts: {
    corpId?: string
    corpSecret?: string
    agentId?: string
  }): Promise<WeChatState> {
    if (opts.corpId !== undefined) {
      const normalized = opts.corpId.trim()
      setSystemPropValue(WECHAT_CORP_ID_KEY, normalized)
      this.state.corpId = normalized
    }
    if (opts.corpSecret !== undefined) {
      setSystemPropValue(WECHAT_CORP_SECRET_KEY, opts.corpSecret.trim())
    }
    if (opts.agentId !== undefined) {
      const normalized = opts.agentId.trim()
      setSystemPropValue(WECHAT_AGENT_ID_KEY, normalized)
      this.state.agentId = normalized
    }

    this.accessToken = null
    this.tokenExpiresAt = 0
    this.started = false

    const corpId = this.readCorpId()
    const corpSecret = this.readCorpSecret()
    if (corpId && corpSecret) {
      try {
        await this.start()
      } catch {
        // start() already sets error state
      }
    } else {
      this.state.status = 'idle'
    }

    return this.getState()
  }

  async ensureStarted(): Promise<void> {
    if (this.started) return
    if (!this.readCorpId() || !this.readCorpSecret()) return

    if (!this.bootPromise) {
      this.bootPromise = this.start().finally(() => {
        this.bootPromise = null
      })
    }
    await this.bootPromise
  }

  async stop(): Promise<WeChatState> {
    this.accessToken = null
    this.tokenExpiresAt = 0
    this.started = false
    this.state.status = 'disconnected'
    this.state.lastError = null
    this.chatMessages = []

    return this.getState()
  }

  getChatMessages(): WeChatChatMessage[] {
    return [...this.chatMessages]
  }

  async sendMessageToUser(
    userId: string,
    text: string,
  ): Promise<WeChatChatMessage[]> {
    const normalizedUser = userId.trim()
    const messageText = text.trim()
    if (!normalizedUser || !messageText) return this.getChatMessages()

    if (!this.started) {
      throw new Error('WeChat bot is not connected')
    }

    const token = await this.getAccessToken()
    const agentId = this.readAgentId()
    const url = `${SEND_URL}?access_token=${encodeURIComponent(token)}`

    const body = {
      touser: normalizedUser,
      msgtype: 'text',
      agentid: Number(agentId) || 0,
      text: { content: messageText },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`WeChat API HTTP ${res.status}`)
    }

    const json = (await res.json()) as SendMessageResponse
    if (json.errcode !== 0) {
      throw new Error(`WeChat API error ${json.errcode}: ${json.errmsg}`)
    }

    log.info('Sent WeChat message', { userId: normalizedUser })

    this.appendChatMessage({
      id: `local-${Date.now()}`,
      text: messageText,
      fromMe: true,
      timestamp: Date.now(),
    })

    return this.getChatMessages()
  }

  handleIncomingWebhook(payload: {
    fromUser: string
    text: string
    msgId: string
    createTime: number
  }): void {
    const { fromUser, text, msgId, createTime } = payload
    if (!text) return

    log.info('Incoming WeChat message', {
      fromUser,
      textLength: text.length,
    })

    this.appendChatMessage({
      id: msgId,
      text,
      fromMe: false,
      timestamp: createTime * 1000,
    })

    getChannelConversationBridge().onIncomingMessage({
      channelId: CHANNEL_ID,
      senderId: fromUser,
      senderTarget: fromUser,
      text,
      occurredAtIso: new Date(createTime * 1000).toISOString(),
      agentId: DEFAULT_WECHAT_AGENT_ID,
    })
  }

  private async start(): Promise<void> {
    const corpId = this.readCorpId()
    const corpSecret = this.readCorpSecret()
    if (!corpId || !corpSecret) {
      this.state.status = 'idle'
      return
    }

    this.state.status = 'connecting'
    this.state.lastError = null

    try {
      await this.refreshAccessToken()
      this.started = true
      this.state.status = 'connected'
      this.state.lastError = null
      log.info('WeChat Work bot connected', { corpId })
    } catch (err) {
      this.state.status = 'error'
      this.state.lastError =
        err instanceof Error ? err.message : String(err)
      log.error('Failed to start WeChat bot', { err })
      throw err
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }
    await this.refreshAccessToken()
    return this.accessToken!
  }

  private async refreshAccessToken(): Promise<void> {
    const corpId = this.readCorpId()
    const corpSecret = this.readCorpSecret()

    const url = `${TOKEN_URL}?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`WeChat token API HTTP ${res.status}`)
    }

    const json = (await res.json()) as AccessTokenResponse
    if (json.errcode !== 0 || !json.access_token) {
      throw new Error(
        `WeChat token error ${json.errcode}: ${json.errmsg}`,
      )
    }

    this.accessToken = json.access_token
    this.tokenExpiresAt =
      Date.now() + (json.expires_in ?? 7200) * 1000 - TOKEN_REFRESH_BUFFER_MS
    log.info('WeChat access token refreshed')
  }

  private readCorpId(): string {
    return getSystemPropValue(WECHAT_CORP_ID_KEY, '')
  }

  private readCorpSecret(): string {
    return getSystemPropValue(WECHAT_CORP_SECRET_KEY, '')
  }

  private readAgentId(): string {
    return getSystemPropValue(WECHAT_AGENT_ID_KEY, '')
  }

  private readBotName(): string {
    return getSystemPropValue(WECHAT_BOT_NAME_KEY, DEFAULT_BOT_NAME)
  }

  private appendChatMessage(message: WeChatChatMessage): void {
    this.chatMessages = [...this.chatMessages, message].slice(-100)
  }
}

let manager: WeChatChannelManager | null = null

export function getWeChatChannelManager(): WeChatChannelManager {
  if (!manager) {
    manager = new WeChatChannelManager()
  }
  return manager
}
