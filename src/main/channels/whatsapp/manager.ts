import { app } from 'electron'
import { join } from 'path'
import { mkdir, rm } from 'fs/promises'
import { createRequire } from 'module'
import QRCode from 'qrcode'
import { getopenfdeWhatsAppAuthDir } from '@config/openfde-home'
import { getSystemPropValue, setSystemPropValue } from '@config/system-prop'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { getChannelConversationBridge } from '@main/channels/framework/conversation-bridge'
import { createLogger } from '@main/logger'

type RuntimeSocket = {
  ev: {
    on: (event: string, listener: (...args: any[]) => void) => void
  }
  user?: {
    id?: string
  }
  sendMessage: (
    jid: string,
    message: { text: string },
  ) => Promise<unknown> | unknown
  end: (error?: Error) => void
}

type BaileysModule = {
  default: (args: Record<string, unknown>) => RuntimeSocket
  DisconnectReason: { loggedOut: number }
  fetchLatestBaileysVersion: () => Promise<{ version: number[] }>
  useMultiFileAuthState: (
    dir: string,
  ) => Promise<{ state: unknown; saveCreds: () => Promise<void> | void }>
}

const require = createRequire(
  typeof __filename === 'string' ? __filename : join(process.cwd(), 'main.js'),
)
const baileys = require('@whiskeysockets/baileys') as BaileysModule

const WHATSAPP_BOT_NAME_KEY = 'settings.whatsapp.botName'
const WHATSAPP_TARGET_PHONE_KEY = 'settings.whatsapp.targetPhone'
const DEFAULT_BOT_NAME = 'OpenFDE WhatsApp Bot'
const DEFAULT_WHATSAPP_AGENT_ID = 'skill:default'
const CHANNEL_ID = 'whatsapp'
const log = createLogger('channels.whatsapp.manager')
const baileysLog = createLogger('channels.whatsapp.baileys').raw.child({
  class: 'baileys',
})

// Baileys emits frequent reconnect/status messages at info level.
// Keep library logs quieter while preserving this app's own logger output.
baileysLog.level = 'warn'

export type WhatsAppConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface WhatsAppState {
  botName: string
  targetPhone: string
  status: WhatsAppConnectionStatus
  qrCodeDataUrl: string | null
  lastError: string | null
}

export interface WhatsAppChatMessage {
  id: string
  text: string
  fromMe: boolean
  timestamp: number
}

class WhatsAppChannelManager {
  private socket: RuntimeSocket | null = null
  private bootPromise: Promise<void> | null = null
  private get authDir(): string {
    return getopenfdeWhatsAppAuthDir()
  }
  private suppressReconnectOnce = false
  private chatMessages: WhatsAppChatMessage[] = []

  constructor() {
    getChannelRegistry().register(CHANNEL_ID, {
      sendToTarget: async (target, text) => {
        await this.sendMessageToJid(target, text)
      },
    })
  }

  private state: WhatsAppState = {
    botName: this.readBotName(),
    targetPhone: this.readTargetPhone(),
    status: 'idle',
    qrCodeDataUrl: null,
    lastError: null,
  }

  getState(): WhatsAppState {
    return { ...this.state }
  }

  setBotName(botName: string): WhatsAppState {
    const normalized = botName.trim() || DEFAULT_BOT_NAME
    setSystemPropValue(WHATSAPP_BOT_NAME_KEY, normalized)
    this.state.botName = normalized
    return this.getState()
  }

  setTargetPhone(targetPhone: string): WhatsAppState {
    const normalized = targetPhone.trim()
    setSystemPropValue(WHATSAPP_TARGET_PHONE_KEY, normalized)
    this.state.targetPhone = normalized
    return this.getState()
  }

  async ensureStarted(): Promise<void> {
    if (this.socket) return
    if (!this.bootPromise) {
      this.bootPromise = this.createSocket().finally(() => {
        this.bootPromise = null
      })
    }
    await this.bootPromise
  }

  async refreshQrCode(): Promise<WhatsAppState> {
    await this.restartSocket()
    await this.waitForSettledState()
    return this.getState()
  }

  async logoutSession(): Promise<WhatsAppState> {
    this.suppressReconnectOnce = true

    if (this.socket) {
      try {
        this.socket.end(new Error('User requested WhatsApp logout'))
      } catch {
        // Ignore socket teardown errors during logout.
      }
      this.socket = null
    }

    await rm(this.authDir, { recursive: true, force: true })

    this.state.status = 'disconnected'
    this.state.qrCodeDataUrl = null
    this.state.lastError = null
    this.chatMessages = []

    return this.getState()
  }

  getChatMessages(): WhatsAppChatMessage[] {
    return [...this.chatMessages]
  }

  async sendChatMessage(text: string): Promise<WhatsAppChatMessage[]> {
    const messageText = text.trim()
    if (!messageText) return this.getChatMessages()

    await this.ensureStarted()
    if (!this.socket) {
      throw new Error('WhatsApp socket is not connected')
    }

    const jid = this.resolveChatJid(this.socket)
    if (!jid) {
      throw new Error(
        'Cannot determine WhatsApp chat recipient. Set a target phone number.',
      )
    }

    const prefixedText = this.prefixOutbound(messageText)
    await this.socket.sendMessage(jid, { text: prefixedText })

    this.appendChatMessage({
      id: `local-${Date.now()}`,
      text: messageText,
      fromMe: true,
      timestamp: Date.now(),
    })

    return this.getChatMessages()
  }

  async sendMessageToJid(
    jid: string,
    text: string,
  ): Promise<WhatsAppChatMessage[]> {
    const normalizedJid = this.normalizeJid(jid.trim())
    const messageText = text.trim()
    if (!normalizedJid || !messageText) return this.getChatMessages()

    await this.ensureStarted()
    if (!this.socket) {
      throw new Error('WhatsApp socket is not connected')
    }

    await this.socket.sendMessage(normalizedJid, {
      text: this.prefixOutbound(messageText),
    })

    this.appendChatMessage({
      id: `local-${Date.now()}`,
      text: messageText,
      fromMe: true,
      timestamp: Date.now(),
    })

    return this.getChatMessages()
  }

  private async waitForSettledState(
    timeoutMs = 12000,
    intervalMs = 200,
  ): Promise<void> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      if (this.state.qrCodeDataUrl) return
      if (this.state.status === 'connected' || this.state.status === 'error') {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  private readBotName(): string {
    return getSystemPropValue(WHATSAPP_BOT_NAME_KEY, DEFAULT_BOT_NAME)
  }

  private readTargetPhone(): string {
    return getSystemPropValue(WHATSAPP_TARGET_PHONE_KEY, '')
  }

  private async sendGreetingMessage(socket: RuntimeSocket): Promise<void> {
    const jid = this.resolveChatJid(socket)
    if (!jid) return

    const text = this.prefixOutbound(
      `Hi, I am ${this.state.botName}. What I can do for you today?`,
    )

    try {
      await socket.sendMessage(jid, { text })
    } catch (error) {
      this.state.lastError =
        error instanceof Error ? error.message : String(error)
    }
  }

  private prefixOutbound(text: string): string {
    return `[${this.state.botName}] ${text}`
  }

  private parseIncomingText(
    raw: string,
  ): { text: string; fromMe: boolean } | null {
    const myPrefix = `[${this.state.botName}] `
    if (raw.startsWith(myPrefix)) {
      return { text: raw.slice(myPrefix.length), fromMe: true }
    }
    // Drop messages that carry a different bot's prefix (another instance).
    if (/^\[.+?\] /.test(raw)) {
      return null
    }
    return { text: raw, fromMe: false }
  }

  private resolveSenderId(item: any): string {
    const participant =
      typeof item?.key?.participant === 'string' ? item.key.participant : ''
    const remoteJid =
      typeof item?.key?.remoteJid === 'string' ? item.key.remoteJid : ''
    const raw = participant || remoteJid
    if (!raw) return 'unknown'
    return this.normalizeJid(raw)
  }

  private async handleIncomingUserMessage(
    item: any,
    messageText: string,
  ): Promise<void> {
    log.info('Handling incoming WhatsApp message', {
      textLength: messageText.length,
    })

    const senderId = this.resolveSenderId(item)
    const remoteJid =
      typeof item?.key?.remoteJid === 'string' ? item.key.remoteJid : ''
    const senderTarget = remoteJid ? this.normalizeJid(remoteJid) : ''

    log.debug('Resolved WhatsApp sender identifiers', {
      senderId,
      senderTarget,
    })

    if (!senderTarget) {
      log.warn('Skipping WhatsApp message without sender target', { senderId })
      return
    }

    const createdAtIso = new Date(
      Number(item?.messageTimestamp ?? Date.now()) * 1000,
    ).toISOString()

    log.info('Forwarding WhatsApp message to conversation bridge', {
      senderId,
      senderTarget,
    })
    getChannelConversationBridge().onIncomingMessage({
      channelId: CHANNEL_ID,
      senderId,
      senderTarget,
      text: messageText,
      occurredAtIso: createdAtIso,
      agentId: DEFAULT_WHATSAPP_AGENT_ID,
    })
  }

  private resolveChatJid(socket: RuntimeSocket): string | null {
    const configuredJid = this.resolveConfiguredTargetJid()
    if (configuredJid) {
      return configuredJid
    }
    return socket.user?.id ?? null
  }

  private resolveConfiguredTargetJid(): string | null {
    const configured = this.state.targetPhone.trim()
    if (configured) {
      if (configured.includes('@')) {
        return configured
      }
      const digits = configured.replace(/\D/g, '')
      if (digits) {
        return `${digits}@s.whatsapp.net`
      }
    }
    return null
  }

  /** Strip the :device suffix Baileys appends to the logged-in user's JID.
   *  e.g. 15551234567:0@s.whatsapp.net → 15551234567@s.whatsapp.net */
  private normalizeJid(jid: string): string {
    return jid.replace(/:\d+@/, '@')
  }

  private appendChatMessage(message: WhatsAppChatMessage): void {
    this.chatMessages = [...this.chatMessages, message].slice(-100)
  }

  private async createSocket(): Promise<void> {
    await mkdir(this.authDir, { recursive: true })
    this.state.status = 'connecting'
    this.state.lastError = null

    const { state, saveCreds } = await baileys.useMultiFileAuthState(
      this.authDir,
    )
    const { version } = await baileys.fetchLatestBaileysVersion()

    const socket = baileys.default({
      auth: state,
      version,
      logger: baileysLog,
      printQRInTerminal: false,
      browser: [this.state.botName, 'Desktop', '1.0.0'],
      markOnlineOnConnect: false,
    })

    socket.ev.on('creds.update', saveCreds)
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (connection === 'connecting') {
        this.state.status = 'connecting'
      }

      if (qr) {
        this.state.qrCodeDataUrl = await QRCode.toDataURL(qr, {
          width: 280,
          margin: 1,
        })
      }

      if (connection === 'open') {
        this.state.status = 'connected'
        this.state.qrCodeDataUrl = null
        this.state.lastError = null
        //void this.sendGreetingMessage(socket)
      }

      if (connection === 'close') {
        const disconnectError = lastDisconnect?.error
        const statusCode =
          (disconnectError as { output?: { statusCode?: number } } | undefined)
            ?.output?.statusCode ?? 0
        const isConflict = this.isConflictDisconnect(disconnectError)
        const shouldReconnect =
          !this.suppressReconnectOnce &&
          statusCode !== baileys.DisconnectReason.loggedOut &&
          !isConflict

        this.suppressReconnectOnce = false
        this.socket = null

        this.state.status = 'disconnected'
        if (isConflict) {
          this.state.lastError =
            'WhatsApp session conflict detected. Close other active WhatsApp Web sessions and refresh QR code.'
        }

        if (shouldReconnect) {
          void this.restartSocket()
          return
        }

        this.state.qrCodeDataUrl = null
      }
    })

    socket.ev.on('messages.upsert', (payload: any) => {
      const messages = Array.isArray(payload?.messages) ? payload.messages : []
      for (const item of messages) {
        const rawText: string | null =
          item?.message?.conversation ??
          item?.message?.extendedTextMessage?.text ??
          null
        if (!rawText) continue

        // Skip only echoes of messages this bot sent (identified by the bot
        // prefix). Messages sent from your own phone (fromMe but no prefix)
        // should still appear as received messages.
        if (rawText.startsWith(`[${this.state.botName}] `)) continue

        const parsed = this.parseIncomingText(rawText)
        if (!parsed) continue

        this.appendChatMessage({
          id: String(item?.key?.id ?? `msg-${Date.now()}`),
          text: parsed.text,
          fromMe: parsed.fromMe,
          timestamp: Number(item?.messageTimestamp ?? Date.now()) * 1000,
        })

        if (!parsed.fromMe) {
          void this.handleIncomingUserMessage(item, parsed.text).catch(
            (error) => {
              this.state.lastError =
                error instanceof Error ? error.message : String(error)
            },
          )
        }
      }
    })

    this.socket = socket
  }

  private async restartSocket(): Promise<void> {
    if (this.socket) {
      // Avoid duplicate reconnect loops from the old socket close event during manual restart.
      this.suppressReconnectOnce = true
      try {
        this.socket.end(new Error('Restarting WhatsApp socket'))
      } catch {
        // Ignore socket teardown errors during manual restart.
      }
      this.socket = null
    }

    this.state.qrCodeDataUrl = null
    this.state.status = 'connecting'

    try {
      await this.createSocket()
    } catch (error) {
      this.state.status = 'error'
      this.state.lastError =
        error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  private isConflictDisconnect(error: unknown): boolean {
    const message = this.getErrorMessage(error)
    return message.toLowerCase().includes('conflict')
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message ?? '')
    }
    return ''
  }
}

let manager: WhatsAppChannelManager | null = null

export function getWhatsAppChannelManager(): WhatsAppChannelManager {
  if (!manager) {
    manager = new WhatsAppChannelManager()
  }
  return manager
}
