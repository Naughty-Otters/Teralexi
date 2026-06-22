import { BrowserWindow } from 'electron'
import { getConversationStore } from '@main/services/conversation-store'
import { notifyConversationStoreChanged } from '@main/services/conversation-store-notify'
import { resolveChannelSessionId } from '@shared/conversation/session-id'
import { getChannelRegistry } from './channel-registry'
import { runAgentForConversation } from '@main/engine'
import { serializeAssistantMessageForExternalReply } from '@main/agent/utils'
import { ConfigContext } from '@main/agent/config/context'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import { randomShortUuid } from '@shared/utils/short-uuid'
import { extractThreadTag } from '@main/agent/expr/thread-tagger'
import { getWorkflowDispatcher } from '@main/workflows/workflow-dispatcher'

const log = createLogger('channels.conversation-bridge')

export interface BridgeIncomingArgs {
  channelId: string
  senderId: string
  senderTarget: string
  text: string
  occurredAtIso: string
  agentId: string
}

class ChannelConversationBridge {
  private getOrCreateConversationId(args: {
    channelId: string
    senderId: string
    firstUserMessage: string
    agentId: string
  }): string {
    const store = getConversationStore()
    const conversationId = resolveChannelSessionId({
      channelId: args.channelId,
      senderId: args.senderId,
      lookupConversation: (id) => store.getConversation(id),
    })

    const existing = store.getConversation(conversationId)
    if (existing) return conversationId

    const now = new Date().toISOString()
    const trimmed = args.firstUserMessage.trim()
    const titleBase =
      trimmed.length > 60
        ? `${trimmed.slice(0, 57)}...`
        : trimmed || 'Channel Conversation'
    const title = `${args.channelId}: ${titleBase}`

    store.createConversation({
      id: conversationId,
      agentId: args.agentId,
      title,
      createdAt: now,
      updatedAt: now,
    })

    return conversationId
  }

  private saveConversationMessage(args: {
    conversationId: string
    role: 'user' | 'assistant'
    content: string
    createdAtIso: string
    agentId: string
    threadTag?: string
  }): void {
    getConversationStore().saveMessage({
      id: randomShortUuid(),
      conversationId: args.conversationId,
      agentId: args.agentId,
      role: args.role,
      content: args.content,
      createdAt: args.createdAtIso,
      threadTag: args.threadTag ?? extractThreadTag(args.content),
    })
  }

  private notifyConversationStoreChanged(
    conversationId: string,
    agentId: string,
  ): void {
    notifyConversationStoreChanged(conversationId, agentId)
  }

  private async runAgentAndReply(args: {
    channelId: string
    senderTarget: string
    conversationId: string
    agentId: string
    assistantMessageId: string
  }): Promise<void> {
    const windows = BrowserWindow.getAllWindows().filter(
      (w) => !w.isDestroyed(),
    )
    const webContents = windows[0]?.webContents

    const result = await runAgentForConversation({
      conversationId: args.conversationId,
      agentId: args.agentId,
      assistantMessageId: args.assistantMessageId,
      userId: ConfigContext.DEFAULT_USER_ID,
      webContents,
    })

    // Send reply via channel
    if (!result.hasError && result.finalContent.trim()) {
      try {
        const sender = getChannelRegistry().get(args.channelId)
        if (sender) {
          const replyText = serializeAssistantMessageForExternalReply(
            result.finalContent,
          )
          if (replyText.trim()) {
            await sender.sendToTarget(args.senderTarget, replyText)
          }
        }
      } catch (err) {
        log.error('Failed to send channel reply', {
          channelId: args.channelId,
          conversationId: args.conversationId,
          err,
        })
      }
    }

    // Notify renderer of final state
    this.notifyConversationStoreChanged(args.conversationId, args.agentId)
  }

  onIncomingMessage(args: BridgeIncomingArgs): void {
    log.info('Received channel message', {
      channelId: args.channelId,
      senderId: args.senderId,
      agentId: args.agentId,
      textLength: args.text.length,
    })

    const conversationId = this.getOrCreateConversationId({
      channelId: args.channelId,
      senderId: args.senderId,
      firstUserMessage: args.text,
      agentId: args.agentId,
    })

    log.info('Resolved channel conversation', {
      channelId: args.channelId,
      conversationId,
    })

    this.saveConversationMessage({
      conversationId,
      role: 'user',
      content: args.text,
      createdAtIso: args.occurredAtIso,
      agentId: args.agentId,
    })

    log.info('Saved incoming channel message', {
      conversationId,
      agentId: args.agentId,
    })
    this.notifyConversationStoreChanged(conversationId, args.agentId)

    void (async () => {
      try {
        const workflowResult =
          await getWorkflowDispatcher().tryDispatchChannelMessage({
            channelId: args.channelId,
            senderId: args.senderId,
            text: args.text,
            occurredAtIso: args.occurredAtIso,
          })
        if (workflowResult.dispatched) {
          log.info('Channel message handled by workflow', workflowResult)
          return
        }
      } catch (err) {
        log.warn('Workflow channel dispatch skipped', { err })
      }

      const assistantMessageId = randomShortUuid()
      log.info('Triggering agent reply for channel conversation', {
        conversationId,
        assistantMessageId,
      })
      await this.runAgentAndReply({
        channelId: args.channelId,
        senderTarget: args.senderTarget,
        conversationId,
        agentId: args.agentId,
        assistantMessageId,
      })
    })()
  }
}

let bridge: ChannelConversationBridge | null = null

export function getChannelConversationBridge(): ChannelConversationBridge {
  if (!bridge) {
    bridge = instrumentInstanceMethods(new ChannelConversationBridge(), log)
  }
  return bridge
}
