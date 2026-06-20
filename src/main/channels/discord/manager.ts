import { Client, Events, GatewayIntentBits } from 'discord.js'
import type { Message } from 'discord.js'
import { getSystemPropValue, setSystemPropValue } from '@config/system-prop'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { getChannelConversationBridge } from '@main/channels/framework/conversation-bridge'
import { createLogger } from '@main/logger'

const DISCORD_BOT_TOKEN_KEY = 'settings.discord.botToken'
const DISCORD_BOT_NAME_KEY = 'settings.discord.botName'
const DEFAULT_BOT_NAME = 'OpenFDE Discord Bot'
const DEFAULT_DISCORD_AGENT_ID = 'skill:default'
const CHANNEL_ID = 'discord'
const log = createLogger('channels.discord.manager')

export type DiscordConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface DiscordState {
  botName: string
  botToken: string
  botUsername: string | null
  status: DiscordConnectionStatus
  lastError: string | null
}

export interface DiscordChatMessage {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

class DiscordChannelManager {
  private client: Client | null = null
  private bootPromise: Promise<void> | null = null
  private chatMessages: DiscordChatMessage[] = []
  private selfId: string | null = null

  constructor() {
    getChannelRegistry().register(CHANNEL_ID, {
      sendToTarget: async (target, text) => {
        await this.sendMessageToChannel(target, text)
      },
    })
  }

  private state: DiscordState = {
    botName: this.readBotName(),
    botToken: this.readBotToken(),
    botUsername: null,
    status: 'idle',
    lastError: null,
  }

  getState(): DiscordState {
    return { ...this.state, botToken: this.maskToken(this.state.botToken) }
  }

  setBotName(botName: string): DiscordState {
    const normalized = botName.trim() || DEFAULT_BOT_NAME
    setSystemPropValue(DISCORD_BOT_NAME_KEY, normalized)
    this.state.botName = normalized
    return this.getState()
  }

  async setBotToken(botToken: string): Promise<DiscordState> {
    const normalized = botToken.trim()
    setSystemPropValue(DISCORD_BOT_TOKEN_KEY, normalized)
    this.state.botToken = normalized

    if (this.client) {
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
    if (this.client) return
    if (!this.state.botToken) return

    if (!this.bootPromise) {
      this.bootPromise = this.start().finally(() => {
        this.bootPromise = null
      })
    }
    await this.bootPromise
  }

  async stop(): Promise<DiscordState> {
    if (this.client) {
      try {
        this.client.destroy()
      } catch {
        // Ignore destroy errors
      }
      this.client = null
    }

    this.state.status = 'disconnected'
    this.state.botUsername = null
    this.state.lastError = null
    this.selfId = null
    this.chatMessages = []

    return this.getState()
  }

  getChatMessages(): DiscordChatMessage[] {
    return [...this.chatMessages]
  }

  async sendMessageToChannel(
    channelId: string,
    text: string,
  ): Promise<DiscordChatMessage[]> {
    const normalized = channelId.trim()
    const messageText = text.trim()
    if (!normalized || !messageText) return this.getChatMessages()

    if (!this.client) {
      throw new Error('Discord bot is not connected')
    }

    try {
      const channel = await this.client.channels.fetch(normalized)
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        throw new Error(`Channel ${normalized} is not a text channel`)
      }
      await (channel as { send: (text: string) => Promise<unknown> }).send(
        messageText,
      )
    } catch (err) {
      log.error('Failed to send Discord message', { channelId: normalized, err })
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

    this.state.status = 'connecting'
    this.state.lastError = null

    try {
      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      })

      client.once(Events.ClientReady, (readyClient) => {
        this.selfId = readyClient.user.id
        this.state.botUsername = readyClient.user.tag
        this.state.status = 'connected'
        this.state.lastError = null
        log.info('Discord bot connected', { tag: readyClient.user.tag })
      })

      client.on(Events.MessageCreate, (message: Message) => {
        if (message.author.bot) return
        if (message.author.id === this.selfId) return

        void this.handleIncomingMessage(message).catch((err) => {
          log.error('Error handling Discord message', { err })
        })
      })

      client.on(Events.Error, (err) => {
        log.error('Discord client error', { err })
        this.state.lastError = err.message
      })

      await client.login(token)
      this.client = client
    } catch (err) {
      this.state.status = 'error'
      this.state.lastError =
        err instanceof Error ? err.message : String(err)
      log.error('Failed to start Discord bot', { err })
      throw err
    }
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    const text = message.content
    if (!text) return

    const channelId = message.channelId
    const senderId = message.author.id

    log.info('Incoming Discord message', {
      channelId,
      senderId,
      textLength: text.length,
    })

    this.appendChatMessage({
      id: message.id,
      text,
      fromMe: false,
      timestamp: message.createdTimestamp,
    })

    getChannelConversationBridge().onIncomingMessage({
      channelId: CHANNEL_ID,
      senderId,
      senderTarget: channelId,
      text,
      occurredAtIso: message.createdAt.toISOString(),
      agentId: DEFAULT_DISCORD_AGENT_ID,
    })
  }

  private readBotToken(): string {
    return getSystemPropValue(DISCORD_BOT_TOKEN_KEY, '')
  }

  private readBotName(): string {
    return getSystemPropValue(DISCORD_BOT_NAME_KEY, DEFAULT_BOT_NAME)
  }

  private maskToken(token: string): string {
    if (!token || token.length < 10) return token ? '••••••' : ''
    return `${token.slice(0, 4)}••••${token.slice(-4)}`
  }

  private appendChatMessage(message: DiscordChatMessage): void {
    this.chatMessages = [...this.chatMessages, message].slice(-100)
  }
}

let manager: DiscordChannelManager | null = null

export function getDiscordChannelManager(): DiscordChannelManager {
  if (!manager) {
    manager = new DiscordChannelManager()
  }
  return manager
}
