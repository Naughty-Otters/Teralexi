import { formatWorkingMemory, type MemoryConfig } from '@ai-sdk-tools/memory'
import { InMemoryProvider } from '@ai-sdk-tools/memory/in-memory'
import type { ModelMessage } from 'ai'
import { limitMessageContentForPersistence } from '@shared/persistence/limit-persisted-content'
import type { AgentResponseOpts } from './types'

/** Shared in-process memory store for {@link Agent} tool-loop runs. */
let memoryProvider: InMemoryProvider | undefined

export function getAgentMemoryProvider(): InMemoryProvider {
  if (!memoryProvider) {
    memoryProvider = new InMemoryProvider()
  }
  return memoryProvider
}

/** Default memory: working memory, conversation history, and chat sessions. */
export function getAgentMemoryConfig(): MemoryConfig {
  return {
    provider: getAgentMemoryProvider(),
    workingMemory: {
      enabled: true,
      scope: 'chat',
    },
    history: {
      enabled: true,
      limit: 20,
    },
    chats: {
      enabled: true,
      generateTitle: true,
    },
  }
}

export function resolveAgentChatId(
  opts: Pick<
    AgentResponseOpts,
    'conversationId' | 'assistantMessageId'
  >,
  stepScope?: string,
): string | undefined {
  const fromConversation = opts.conversationId?.trim()
  if (fromConversation) return fromConversation
  const fromAssistant = opts.assistantMessageId?.trim()
  if (fromAssistant) return fromAssistant
  const fromStep = stepScope?.trim()
  return fromStep || undefined
}

async function loadWorkingMemoryAddition(
  chatId: string | undefined,
  userId: string | undefined,
): Promise<string> {
  if (!chatId) return ''
  const memory = await getAgentMemoryProvider().getWorkingMemory({
    chatId,
    userId,
    scope: 'chat',
  })
  return formatWorkingMemory(memory)
}

/**
 * Context required by `@ai-sdk-tools/agents` `Agent.stream` (avoids
 * `_memoryAddition` on undefined). Includes chat/user ids for memory tools.
 */
export async function buildAgentExecutionContext(
  opts: AgentResponseOpts,
  stepScope?: string,
): Promise<Record<string, unknown>> {
  const chatId = resolveAgentChatId(opts, stepScope)
  const userId = opts.userId?.trim() || undefined

  const executionContext: Record<string, unknown> = {
    ...(chatId ? { chatId } : {}),
    ...(userId ? { userId } : {}),
    ...(chatId || userId
      ? { metadata: { ...(chatId ? { chatId } : {}), ...(userId ? { userId } : {}) } }
      : {}),
  }

  const memoryAddition = await loadWorkingMemoryAddition(chatId, userId)
  if (memoryAddition.trim()) {
    executionContext._memoryAddition = memoryAddition
  }

  return executionContext
}

function textFromModelMessageContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'type' in part) {
        if (part.type === 'text' && 'text' in part) {
          return String((part as { text: string }).text)
        }
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/** Persist the latest user turn and assistant reply for {@link getAgentMemoryConfig} history. */
export async function persistAgentStreamTurn(
  opts: AgentResponseOpts,
  messages: ModelMessage[],
  assistantText: string,
  stepScope?: string,
): Promise<void> {
  const chatId = resolveAgentChatId(opts, stepScope)
  if (!chatId) return

  const userId = opts.userId?.trim() || undefined
  const provider = getAgentMemoryProvider()
  const now = new Date()

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const userContent = lastUser
    ? textFromModelMessageContent(lastUser.content)
    : ''

  const saves: Promise<void>[] = []
  if (userContent.trim()) {
    saves.push(
      provider.saveMessage({
        chatId,
        userId,
        role: 'user',
        content: limitMessageContentForPersistence(
          userContent.trim(),
          'user',
        ),
        timestamp: now,
      }),
    )
  }
  if (assistantText.trim()) {
    saves.push(
      provider.saveMessage({
        chatId,
        userId,
        role: 'assistant',
        content: limitMessageContentForPersistence(
          assistantText.trim(),
          'assistant',
        ),
        timestamp: now,
      }),
    )
  }

  if (saves.length === 0) return

  const existing = await provider.getChat(chatId)
  await Promise.all([
    ...saves,
    provider.saveChat({
      chatId,
      userId,
      title: existing?.title,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messageCount: (existing?.messageCount ?? 0) + saves.length,
    }),
  ])
}
