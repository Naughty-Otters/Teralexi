import { createLogger, instrumentInstanceMethods } from '@main/logger'

export interface ChannelMessageSender {
  sendToTarget(target: string, text: string): Promise<void>
}

const log = createLogger('channels.channel-registry')

class ChannelRegistry {
  private senders = new Map<string, ChannelMessageSender>()

  register(channelId: string, sender: ChannelMessageSender): void {
    this.senders.set(channelId, sender)
  }

  get(channelId: string): ChannelMessageSender | null {
    return this.senders.get(channelId) ?? null
  }
}

let registry: ChannelRegistry | null = null

export function getChannelRegistry(): ChannelRegistry {
  if (!registry) {
    registry = instrumentInstanceMethods(new ChannelRegistry(), log)
  }
  return registry
}
