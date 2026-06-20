import { App } from '@slack/bolt'
import { getSystemPropValue, setSystemPropValue } from '@config/system-prop'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { getChannelConversationBridge } from '@main/channels/framework/conversation-bridge'
import { createLogger } from '@main/logger'

const SLACK_BOT_TOKEN_KEY = 'settings.slack.botToken'
const SLACK_APP_TOKEN_KEY = 'settings.slack.appToken'
const SLACK_BOT_NAME_KEY = 'settings.slack.botName'
const DEFAULT_BOT_NAME = 'OpenFDE Slack Bot'
const DEFAULT_SLACK_AGENT_ID = 'skill:default'
const CHANNEL_ID = 'slack'
const log = createLogger('channels.slack.manager')

export type SlackConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface SlackState {
  botName: string
  botToken: string
  appToken: string
  botUserId: string | null
  status: SlackConnectionStatus
  lastError: string | null
}

export interface SlackChatMessage {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

class SlackChannelManager {
  private app: App | null = null
  private bootPromise: Promise<void> | null = null
  private chatMessages: SlackChatMessage[] = []
  private selfId: string | null = null

  constructor() {
    getChannelRegistry().register(CHANNEL_ID, {
      sendToTarget: async (target, text) => {
        await this.sendMessageToChannel(target, text)
      },
    })
  }

  private state: SlackState = {
    botName: this.readBotName(),
    botToken: this.readBotToken(),
    appToken: this.readAppToken(),
    botUserId: null,
    status: 'idle',
    lastError: null,
  }

  getState(): SlackState {
    return {
      ...this.state,
      botToken: this.maskToken(this.state.botToken),
      appToken: this.maskToken(this.state.appToken),
    }
  }

  setBotName(botName: string): SlackState {
    const normalized = botName.trim() || DEFAULT_BOT_NAME
    setSystemPropValue(SLACK_BOT_NAME_KEY, normalized)
    this.state.botName = normalized
    return this.getState()
  }

  async setTokens(opts: {
    botToken?: string
    appToken?: string
  }): Promise<SlackState> {
    if (opts.botToken !== undefined) {
      const normalized = opts.botToken.trim()
      setSystemPropValue(SLACK_BOT_TOKEN_KEY, normalized)
      this.state.botToken = normalized
    }
    if (opts.appToken !== undefined) {
      const normalized = opts.appToken.trim()
      setSystemPropValue(SLACK_APP_TOKEN_KEY, normalized)
      this.state.appToken = normalized
    }

    if (this.app) {
      await this.stop()
    }

    const botToken = this.state.botToken
    const appToken = this.state.appToken
    if (botToken && appToken) {
      try {
        await this.start()
      } catch {
        // start() already sets error state
      }
    } else {
      this.state.status = botToken || appToken ? 'idle' : 'idle'
    }

    return this.getState()
  }

  async ensureStarted(): Promise<void> {
    if (this.app) return
    if (!this.state.botToken || !this.state.appToken) return

    if (!this.bootPromise) {
      this.bootPromise = this.start().finally(() => {
        this.bootPromise = null
      })
    }
    await this.bootPromise
  }

  async stop(): Promise<SlackState> {
    if (this.app) {
      try {
        await this.app.stop()
      } catch {
        // Ignore stop errors
      }
      this.app = null
    }

    this.state.status = 'disconnected'
    this.state.botUserId = null
    this.state.lastError = null
    this.selfId = null
    this.chatMessages = []

    return this.getState()
  }

  getChatMessages(): SlackChatMessage[] {
    return [...this.chatMessages]
  }

  async sendMessageToChannel(
    channelId: string,
    text: string,
  ): Promise<SlackChatMessage[]> {
    const normalized = channelId.trim()
    const messageText = text.trim()
    if (!normalized || !messageText) return this.getChatMessages()

    if (!this.app) {
      throw new Error('Slack bot is not connected')
    }

    try {
      await this.app.client.chat.postMessage({
        channel: normalized,
        text: messageText,
      })
    } catch (err) {
      log.error('Failed to send Slack message', { channelId: normalized, err })
      throw err
    }

    this.appendChatMessage({
      id: `local-${Date.now()}`,
      text: messageText,
      fromMe: true,
      timestamp: Date.now(),
    })

    return this.getChatMessages()
  }

  private async start(): Promise<void> {
    const botToken = this.state.botToken
    const appToken = this.state.appToken
    if (!botToken || !appToken) {
      this.state.status = 'idle'
      return
    }

    this.state.status = 'connecting'
    this.state.lastError = null

    try {
      const app = new App({
        token: botToken,
        appToken,
        socketMode: true,
      })

      app.message(async ({ message, say }) => {
        if (message.subtype) return
        if (!('text' in message) || !message.text) return
        if (!('user' in message)) return
        if (message.user === this.selfId) return

        void this.handleIncomingMessage({
          text: message.text,
          userId: message.user!,
          channelId: (message as { channel: string }).channel,
          ts: message.ts,
        }).catch((err) => {
          log.error('Error handling Slack message', { err })
        })
      })

      await app.start()

      const authResult = await app.client.auth.test()
      this.selfId = (authResult.user_id as string) ?? null
      this.state.botUserId = this.selfId
      this.state.status = 'connected'
      this.state.lastError = null
      this.app = app
      log.info('Slack bot connected', { userId: this.selfId })
    } catch (err) {
      this.state.status = 'error'
      this.state.lastError =
        err instanceof Error ? err.message : String(err)
      log.error('Failed to start Slack bot', { err })
      throw err
    }
  }

  private async handleIncomingMessage(payload: {
    text: string
    userId: string
    channelId: string
    ts: string
  }): Promise<void> {
    const { text, userId, channelId, ts } = payload

    log.info('Incoming Slack message', {
      channelId,
      userId,
      textLength: text.length,
    })

    this.appendChatMessage({
      id: ts,
      text,
      fromMe: false,
      timestamp: parseFloat(ts) * 1000,
    })

    getChannelConversationBridge().onIncomingMessage({
      channelId: CHANNEL_ID,
      senderId: userId,
      senderTarget: channelId,
      text,
      occurredAtIso: new Date(parseFloat(ts) * 1000).toISOString(),
      agentId: DEFAULT_SLACK_AGENT_ID,
    })
  }

  private readBotToken(): string {
    return getSystemPropValue(SLACK_BOT_TOKEN_KEY, '')
  }

  private readAppToken(): string {
    return getSystemPropValue(SLACK_APP_TOKEN_KEY, '')
  }

  private readBotName(): string {
    return getSystemPropValue(SLACK_BOT_NAME_KEY, DEFAULT_BOT_NAME)
  }

  private maskToken(token: string): string {
    if (!token || token.length < 10) return token ? '••••••' : ''
    return `${token.slice(0, 6)}••••${token.slice(-4)}`
  }

  private appendChatMessage(message: SlackChatMessage): void {
    this.chatMessages = [...this.chatMessages, message].slice(-100)
  }
}

let manager: SlackChannelManager | null = null

export function getSlackChannelManager(): SlackChannelManager {
  if (!manager) {
    manager = new SlackChannelManager()
  }
  return manager
}
