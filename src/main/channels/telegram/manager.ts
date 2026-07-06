import { Bot, type Context } from 'grammy'
import { getSystemPropValue, setSystemPropValue } from '@config/system-prop'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { getChannelConversationBridge } from '@main/channels/framework/conversation-bridge'
import { createLogger } from '@main/logger'

const TELEGRAM_BOT_TOKEN_KEY = 'settings.telegram.botToken'
const TELEGRAM_BOT_NAME_KEY = 'settings.telegram.botName'
const DEFAULT_BOT_NAME = 'Teralexi Telegram Bot'
const DEFAULT_TELEGRAM_AGENT_ID = 'skill:default'
const CHANNEL_ID = 'telegram'
const log = createLogger('channels.telegram.manager')

export type TelegramConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface TelegramState {
  botName: string
  botToken: string
  botUsername: string | null
  status: TelegramConnectionStatus
  lastError: string | null
}

export interface TelegramChatMessage {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

class TelegramChannelManager {
  private bot: Bot | null = null
  private bootPromise: Promise<void> | null = null
  private chatMessages: TelegramChatMessage[] = []

  constructor() {
    getChannelRegistry().register(CHANNEL_ID, {
      sendToTarget: async (target, text) => {
        await this.sendMessageToChatId(target, text)
      },
    })
  }

  private state: TelegramState = {
    botName: this.readBotName(),
    botToken: this.readBotToken(),
    botUsername: null,
    status: 'idle',
    lastError: null,
  }

  getState(): TelegramState {
    return { ...this.state, botToken: this.maskToken(this.state.botToken) }
  }

  getStateWithToken(): TelegramState {
    return { ...this.state }
  }

  setBotName(botName: string): TelegramState {
    const normalized = botName.trim() || DEFAULT_BOT_NAME
    setSystemPropValue(TELEGRAM_BOT_NAME_KEY, normalized)
    this.state.botName = normalized
    return this.getState()
  }

  async setBotToken(botToken: string): Promise<TelegramState> {
    const normalized = botToken.trim()

    if (this.isMaskedToken(normalized)) {
      if (this.state.botToken && !this.isMaskedToken(this.state.botToken)) {
        if (this.bot) {
          return this.getState()
        }
        try {
          await this.start()
        } catch {
          // start() already sets error state
        }
      }
      return this.getState()
    }

    setSystemPropValue(TELEGRAM_BOT_TOKEN_KEY, normalized)
    this.state.botToken = normalized

    if (this.bot) {
      await this.stop()
    }

    if (normalized) {
      try {
        await this.start()
      } catch {
        // start() already sets error state
      }
    }

    return this.getState()
  }

  async ensureStarted(): Promise<void> {
    if (this.bot) return
    if (!this.state.botToken) return

    if (!this.bootPromise) {
      this.bootPromise = this.start().finally(() => {
        this.bootPromise = null
      })
    }
    await this.bootPromise
  }

  async stop(): Promise<TelegramState> {
    if (this.bot) {
      try {
        this.bot.stop()
      } catch {
        // Ignore stop errors
      }
      this.bot = null
    }

    this.state.status = 'disconnected'
    this.state.botUsername = null
    this.state.lastError = null
    this.chatMessages = []

    return this.getState()
  }

  getChatMessages(): TelegramChatMessage[] {
    return [...this.chatMessages]
  }

  async sendMessageToChatId(
    chatId: string,
    text: string,
  ): Promise<TelegramChatMessage[]> {
    const normalized = chatId.trim()
    const messageText = text.trim()
    if (!normalized || !messageText) return this.getChatMessages()

    if (!this.bot) {
      throw new Error('Telegram bot is not connected')
    }

    try {
      await this.bot.api.sendMessage(normalized, messageText)
    } catch (err) {
      log.error('Failed to send Telegram message', {
        chatId: normalized,
        err,
      })
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
    const token = this.state.botToken
    if (!token) {
      this.state.status = 'idle'
      return
    }

    if (this.isMaskedToken(token) || !this.isValidBotToken(token)) {
      this.state.status = 'error'
      this.state.lastError =
        'Invalid bot token. Paste a fresh token from @BotFather (format: 123456789:ABCdef…).'
      return
    }

    this.state.status = 'connecting'
    this.state.lastError = null

    try {
      const bot = new Bot(token)

      bot.on('message:text', (ctx: Context) => {
        void this.handleIncomingMessage(ctx).catch((err) => {
          log.error('Error handling Telegram message', { err })
        })
      })

      bot.catch((err) => {
        log.error('Telegram bot error', { err: err.error })
        this.state.lastError =
          err.error instanceof Error ? err.error.message : String(err.error)
      })

      const me = await bot.api.getMe()
      this.state.botUsername = me.username ?? null

      this.bot = bot

      await new Promise<void>((resolve, reject) => {
        void bot
          .start({
            onStart: () => {
              log.info('Telegram bot started polling', {
                username: this.state.botUsername,
              })
              this.state.status = 'connected'
              this.state.lastError = null
              resolve()
            },
          })
          .catch((err) => {
            this.bot = null
            reject(err)
          })
      })
    } catch (err) {
      this.state.status = 'error'
      this.state.lastError = this.formatStartError(err)
      log.error('Failed to start Telegram bot', { err })
      throw err
    }
  }

  private async handleIncomingMessage(ctx: Context): Promise<void> {
    const text = ctx.message?.text
    if (!text) return

    const chatId = String(ctx.chat?.id ?? '')
    const senderId = String(ctx.from?.id ?? chatId)
    const senderName =
      ctx.from?.first_name ??
      ctx.from?.username ??
      senderId

    log.info('Incoming Telegram message', {
      chatId,
      senderId,
      textLength: text.length,
    })

    this.appendChatMessage({
      id: String(ctx.message?.message_id ?? `msg-${Date.now()}`),
      text,
      fromMe: false,
      timestamp: (ctx.message?.date ?? Math.floor(Date.now() / 1000)) * 1000,
    })

    getChannelConversationBridge().onIncomingMessage({
      channelId: CHANNEL_ID,
      senderId,
      senderTarget: chatId,
      text,
      occurredAtIso: new Date(
        (ctx.message?.date ?? Math.floor(Date.now() / 1000)) * 1000,
      ).toISOString(),
      agentId: DEFAULT_TELEGRAM_AGENT_ID,
    })
  }

  private readBotToken(): string {
    return getSystemPropValue(TELEGRAM_BOT_TOKEN_KEY, '')
  }

  private readBotName(): string {
    return getSystemPropValue(TELEGRAM_BOT_NAME_KEY, DEFAULT_BOT_NAME)
  }

  private maskToken(token: string): string {
    if (!token || token.length < 10) return token ? '••••••' : ''
    return `${token.slice(0, 4)}••••${token.slice(-4)}`
  }

  private isMaskedToken(token: string): boolean {
    return token.includes('•')
  }

  private isValidBotToken(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]+$/.test(token)
  }

  private formatStartError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('404') || message.includes('401')) {
      return 'Invalid bot token. Check the token from @BotFather and try again.'
    }
    return message
  }

  private appendChatMessage(message: TelegramChatMessage): void {
    this.chatMessages = [...this.chatMessages, message].slice(-100)
  }
}

let manager: TelegramChannelManager | null = null

export function getTelegramChannelManager(): TelegramChannelManager {
  if (!manager) {
    manager = new TelegramChannelManager()
  }
  return manager
}
