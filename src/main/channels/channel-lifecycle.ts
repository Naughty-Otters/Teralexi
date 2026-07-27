import { isTeralexiTestMode } from '@config/test-mode'
import { createLogger } from '@main/logger'
import { getDiscordChannelManager } from './discord/manager'
import { getSlackChannelManager } from './slack/manager'
import { getTelegramChannelManager } from './telegram/manager'
import { getWeChatChannelManager } from './wechat/manager'
import { getWhatsAppChannelManager } from './whatsapp/manager'

const log = createLogger('channels.lifecycle')

let builtinChannelsPromise: Promise<void> | null = null

/**
 * Start built-in channel managers (WhatsApp, Telegram, …) on first use.
 * Skipped in Teralexi test mode.
 */
export function ensureBuiltinChannelManagersStarted(): Promise<void> {
  if (isTeralexiTestMode()) {
    return Promise.resolve()
  }
  if (!builtinChannelsPromise) {
    builtinChannelsPromise = (async () => {
      log.info('Lazy-starting built-in channel managers')
      await Promise.all([
        getWhatsAppChannelManager().ensureStarted(),
        getTelegramChannelManager().ensureStarted(),
        getDiscordChannelManager().ensureStarted(),
        getWeChatChannelManager().ensureStarted(),
        getSlackChannelManager().ensureStarted(),
      ])
    })().catch((err) => {
      builtinChannelsPromise = null
      log.warn('Built-in channel manager startup failed', { err })
      throw err
    })
  }
  return builtinChannelsPromise
}

/** Reset lazy-start state (tests). */
export function resetBuiltinChannelManagersForTests(): void {
  builtinChannelsPromise = null
}
