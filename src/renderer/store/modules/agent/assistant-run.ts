import { isAbortError } from '@shared/utils/abort-error'
import { DEFAULT_USER_ID } from './config'
import {
  mergeStreamingTextIntoStructuredContent,
  serializeAssistantMessageForExternalReply,
  serializeAssistantMessageForHistory,
} from './context'
import type { AgentStoreContext } from './agent-store-context'
import type { AgentPersistenceActions } from './agent-persistence'
import type { ConversationActions } from './conversation-actions'

export type AssistantRunDeps = {
  loadSkillsFromDisk: () => Promise<boolean>
}

export function createAssistantRunActions(
  ctx: AgentStoreContext,
  persistence: AgentPersistenceActions,
  conversation: ConversationActions,
  deps: AssistantRunDeps,
) {
  const {
    log,
    agents,
    conversations,
    selectedAgentId,
    connectionStatus,
    activeStreamState,
    inFlightConversations,
    channelConversationIds,
    currentConversationId,
  } = ctx
  const { waitForPendingAgentConfigurationSave, notifyNextConversationWaiter } = persistence
  const {
    resolveAgentAndEnsureConversationLoaded,
    getOrCreateAssistantMessage,
    buildConversationHistory,
    markAssistantMessageFinished,
    removeAssistantMessageFromConversation,
    createNewConversation,
    renameConversation,
    findConversationMeta,
  } = conversation
  const { loadSkillsFromDisk } = deps

  async function runAssistantForConversation(
    conversationId: string,
    agentId: string,
    options?: {
      forceReloadConversation?: boolean
      /** Channel/scheduler outbound: user-facing text only. */
      externalReply?: boolean
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
    },
  ): Promise<string | null> {
    log.info('Starting renderer-side assistant run', {
      conversationId,
      agentId,
    })

    // Prevent concurrent executions for the same conversation
    if (inFlightConversations.has(conversationId)) {
      log.info(
        'Assistant run skipped because conversation is already in flight',
        {
          conversationId,
        },
      )
      return null
    }
    inFlightConversations.add(conversationId)
    log.info('Conversation marked in flight', {
      conversationId,
      inFlightCount: inFlightConversations.size,
    })
    try {
      const agent = await resolveAgentAndEnsureConversationLoaded(
        conversationId,
        agentId,
        options?.forceReloadConversation ?? false,
      )
      if (!agent) {
        return null
      }

      await waitForPendingAgentConfigurationSave(agentId)

      const abortController = new AbortController()

      var assistantConversation = getOrCreateAssistantMessage(
        (conversationId = conversationId),
      )

      activeStreamState.value = {
        conversationId: conversationId,
        assistantId: assistantConversation.id,
        abortController: abortController,
      }

      const history = buildConversationHistory(
        conversationId,
        assistantConversation.id,
      )

      let stripAssistantPlaceholder = false

      try {
        const provider = agent.provider ?? 'ollama'

        // Wrap stream call in timeout protection
        const streamPromise = (async () => {
          try {
            log.info('Invoking RunAgentForConversation IPC', {
              conversationId,
              agentId,
              assistantMessageId: assistantConversation.id,
            })
            const runChannel =
              window.ipcRendererChannel?.RunAgentForConversation
            if (!runChannel?.invoke) {
              throw new Error('RunAgentForConversation IPC channel unavailable')
            }
            const result = await runChannel.invoke({
              conversationId,
              agentId,
              assistantMessageId: assistantConversation.id,
              userId: DEFAULT_USER_ID,
              ...(options?.pendingUserMessage
                ? { pendingUserMessage: options.pendingUserMessage }
                : {}),
            })
            return result
          } catch (innerErr) {
            log.error('RunAgentForConversation IPC failed', {
              conversationId,
              agentId,
              err: innerErr,
            })
            throw innerErr
          }
        })()

        const timeoutMs = 60000 * 30
        const ipcResult = await Promise.race([
          streamPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              log.error('RunAgentForConversation timed out', {
                conversationId,
                agentId,
                timeoutMs,
              })
              reject(
                new Error(
                  `RunAgentForConversation timeout after ${timeoutMs}ms`,
                ),
              )
            }, timeoutMs),
          ),
        ])

        if (ipcResult.hasError) {
          stripAssistantPlaceholder = true
          log.error('Assistant run completed with error', {
            conversationId,
            agentId,
            assistantMessageId: assistantConversation.id,
            errorMessage: ipcResult.errorMessage?.trim() || 'Agent failed',
          })
        } else if (assistantConversation && ipcResult.finalContent.trim()) {
          assistantConversation.content =
            mergeStreamingTextIntoStructuredContent(
              ipcResult.finalContent,
              assistantConversation.content,
            )
        }

        if (provider === 'ollama' && !ipcResult.hasError)
          connectionStatus.value = 'connected'
        if (provider === 'ollama' && ipcResult.hasError)
          connectionStatus.value = 'error'
        log.info('Renderer-side assistant run completed', {
          conversationId,
          agentId,
          assistantMessageId: assistantConversation.id,
          hasError: ipcResult.hasError,
          finalContentLength: ipcResult.finalContent.length,
        })
      } catch (err: unknown) {
        log.error('Renderer-side assistant run failed', {
          conversationId,
          agentId,
          err,
        })
        if (isAbortError(err)) {
          if (assistantConversation) assistantConversation.isStreaming = false
          log.info('Renderer-side assistant run aborted', {
            conversationId,
            agentId,
            assistantMessageId: assistantConversation.id,
          })
          return null
        }
        stripAssistantPlaceholder = true
        if (agent.provider === 'ollama') connectionStatus.value = 'error'
      } finally {
        log.info('Cleaning up renderer-side assistant run state', {
          conversationId,
          agentId,
          assistantMessageId: assistantConversation.id,
        })

        if (assistantConversation) {
          if (stripAssistantPlaceholder) {
            removeAssistantMessageFromConversation(
              conversationId,
              assistantConversation.id,
            )
          }
          markAssistantMessageFinished(conversationId, assistantConversation.id)
          if (!stripAssistantPlaceholder) {
            const serialize = options?.externalReply
              ? serializeAssistantMessageForExternalReply
              : serializeAssistantMessageForHistory
            const serialized = serialize(assistantConversation.content).trim()
            log.info('Returning serialized assistant response to caller', {
              conversationId,
              agentId,
              assistantMessageId: assistantConversation.id,
              serializedLength: serialized.length,
            })
            return serialized
          }
        } else {
          log.error('Assistant placeholder missing during renderer cleanup', {
            conversationId,
            agentId,
          })
        }
      }

      log.info('Renderer-side assistant run returned no content', {
        conversationId,
        agentId,
      })
      return null
    } finally {
      inFlightConversations.delete(conversationId)
      notifyNextConversationWaiter(conversationId)
      log.info('Conversation removed from in-flight set', {
        conversationId,
        inFlightCount: inFlightConversations.size,
      })
    }
  }

  async function handleChannelIncomingToAgent(args: {
    channelId: string
    senderTarget: string
    conversationId: string
    agentId: string
  }): Promise<void> {
    log.info('Handling incoming channel message for agent', args)

    if (
      !args?.channelId ||
      !args?.agentId ||
      !args?.conversationId ||
      !args?.senderTarget
    ) {
      log.warn('Incoming channel message missing required args', args)
      return
    }

    let resolvedAgentId = args.agentId
    let agentExists = agents.value.some((a) => a.id === resolvedAgentId)
    log.info('Checking requested agent for incoming channel message', {
      requestedAgentId: args.agentId,
      exists: agentExists,
      availableAgents: agents.value.map((a) => a.id),
    })

    if (!agentExists) {
      log.info('Requested agent not found; reloading skills from disk')
      await loadSkillsFromDisk()
      agentExists = agents.value.some((a) => a.id === resolvedAgentId)
      log.info('Agent check after reloading skills', {
        exists: agentExists,
        availableAgents: agents.value.map((a) => a.id),
      })
    }

    if (!agentExists && selectedAgentId.value) {
      log.info('Falling back to selected agent for incoming channel message', {
        fallbackAgentId: selectedAgentId.value,
      })
      resolvedAgentId = selectedAgentId.value
      agentExists = agents.value.some((a) => a.id === resolvedAgentId)
    }

    if (!agentExists) {
      const fallback = agents.value.find((a) => a.enabled) ?? agents.value[0]
      if (!fallback) {
        log.error('No agent available to handle incoming channel message')
        return
      }
      log.info('Using enabled fallback agent for incoming channel message', {
        fallbackAgentId: fallback.id,
      })
      resolvedAgentId = fallback.id
    }

    log.info('Resolved agent for incoming channel message', {
      resolvedAgentId,
      conversationId: args.conversationId,
    })

    // Mark channel-originated conversation (type inferred from id on reload).
    channelConversationIds.value = new Set([
      ...channelConversationIds.value,
      args.conversationId,
    ])

    const replyText = await runAssistantForConversation(
      args.conversationId,
      resolvedAgentId,
      { forceReloadConversation: true, externalReply: true },
    )
    log.info('Incoming channel message produced agent reply', {
      conversationId: args.conversationId,
      resolvedAgentId,
      replyLength: replyText?.length ?? 0,
    })

    if (!replyText) {
      log.warn('No reply text returned for incoming channel message', {
        conversationId: args.conversationId,
        resolvedAgentId,
      })
      return
    }

    const sendChannel = window.ipcRendererChannel?.SendChannelMessage
    log.info('Checking SendChannelMessage availability', {
      available: !!sendChannel?.invoke,
    })

    if (!sendChannel?.invoke) {
      log.error('SendChannelMessage invoke not available')
      return
    }

    log.info('Sending agent reply back to channel', {
      channelId: args.channelId,
      conversationId: args.conversationId,
    })
    try {
      await sendChannel.invoke({
        channelId: args.channelId,
        target: args.senderTarget,
        text: replyText,
      })
      log.info('Successfully sent reply to channel', {
        channelId: args.channelId,
        conversationId: args.conversationId,
      })
    } catch (error) {
      log.error('Failed to send reply to channel', {
        channelId: args.channelId,
        conversationId: args.conversationId,
        err: error,
      })
    }
  }

  async function sendMessage(content: string) {
    const agentId = selectedAgentId.value
    if (!agentId || !content.trim()) return

    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return

    // Ensure there's an active conversation; create one if needed
    let convId = currentConversationId.value
    if (!convId) {
      const trimmed = content.trim()
      const autoTitle =
        trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed
      const conv = await createNewConversation(autoTitle)
      if (!conv) return
      convId = conv.id
    }

    if (!conversations.value[convId]) conversations.value[convId] = []

    // Apply folder picked before this conversation existed (composer folder icon).
    await useWorkspaceStore().commitPendingWorkspace(convId)

    // Auto-title from first user message if conversation still has default title
    const convMeta = findConversationMeta(convId)
    if (
      convMeta &&
      convMeta.title === 'New Conversation' &&
      conversations.value[convId].length === 0
    ) {
      const trimmed = content.trim()
      const autoTitle =
        trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed
      void renameConversation(convId, autoTitle)
    }

    const userMsg: Message = {
      id: randomShortUuid(),
      role: 'user',
      content: content.trim(),
      createdAt: new Date(),
    }
    conversations.value[convId].push(userMsg)

    log.info('Sending user message to agent', {
      agentId,
      conversationId: convId,
      contentLength: userMsg.content.length,
    })

    await runAssistantForConversation(convId, agentId, {
      pendingUserMessage: {
        id: userMsg.id,
        content: userMsg.content,
        createdAt: userMsg.createdAt.toISOString(),
      },
    })
  }
  return {
    runAssistantForConversation,
    handleChannelIncomingToAgent,
    sendMessage,
  }
}
