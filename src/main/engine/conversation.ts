import type { WebContents } from 'electron'
import { getConversationStore } from '@main/services/conversation-store'
import { ensureUserAttachmentsUploadedBeforeAgentRun } from '@main/services/chat-attachments'
import { notifyConversationStoreChanged } from '@main/services/conversation-store-notify'
import { webContentSend } from '@main/services/web-content-send'
import { createLogger } from '@main/logger'
import { ConfigContext } from '@main/agent/config/context'
import { isAbortError } from '@shared/utils/abort-error'
import { runWithAgentRunLog } from '@logging'
import type { AgentResponseOpts, AgentSandboxReadyPayload } from '@main/agent/types'
import {
  extractTrailingUserForPersistence,
  loadAgentRunCredentials,
  loadConversationHistory,
  loadMcpToolsForAgent,
  parseClientUiMessages,
  resolveEnabledSkillToolNames,
} from '@main/agent/utils'
import { loadChatContextWindowMessages } from '@main/agent/utils/chat-context-settings'
import { streamAgentResponse } from '@main/agent/flow'
import { createAgentStreamBridge } from '@main/agent/agent-stream-bridge'
import { createAgentEventBus } from '@main/agent/bus/agent-event-bus'
import { attachIpcProjector } from '@main/agent/bus/ipc-projector'
import { enqueueAgentMemoryExchange } from '@main/agent/memory'
import type { ThreadTag } from '@main/agent/expr/thread-tagger'
import { resolveEffectiveThreadTag } from '@main/agent/expr/thread-context-builder'
import { createLlmDebugRunId } from '@main/agent/llm/llm-debug-writer'
import { formatLlmErrorForUi, llmErrorFields } from '@main/agent/llm/log-llm-error'
import { ProviderContext } from '@main/agent/providers/context'
import { clearPlanExecutionCompleted } from '@main/agent/coding/plan-mode-session-reminders'
import { isPlanModeActive } from '@main/agent/coding/plan-mode-state'
import { runUserHooks } from '@main/agent/hooks/user-hooks'
import { getWorkspacePath } from '@main/agent/workspace/conversation-workspace'
import { autoCompactStoredConversationIfNeeded } from '@main/agent/compaction'
import { resolveResponseLanguageForAgent } from '@main/i18n/resolve-response-language'
import { StageModelRegistry } from '@main/agent/providers/stage-model-registry'
import { AgentRun } from '@main/agent/run/agent-run'
import { mergeSubFlowOutputText } from '@main/agent/run/sub-flow-output-text'
import { resolveDelegatableSubAgentTargets } from '@shared/agent/sub-agent-targets'

const inFlightControllers = new Map<string, AbortController>()
const log = createLogger('agent.engine')

function notifyRendererConversationChanged(
  conversationId: string,
  agentId: string,
  webContents?: WebContents,
): void {
  if (webContents && !webContents.isDestroyed()) {
    webContentSend.ConversationStoreChanged(webContents, {
      conversationId,
      agentId,
    })
    return
  }
  notifyConversationStoreChanged(conversationId, agentId)
}

function resolveTurnUserContent(args: {
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
}): string | null {
  const fromUi = extractTrailingUserForPersistence(
    parseClientUiMessages(args.uiMessages),
  )
  if (fromUi?.content.trim()) return fromUi.content.trim()
  const pending = args.pendingUserMessage
  if (
    pending &&
    typeof pending.content === 'string' &&
    pending.content.trim().length > 0
  ) {
    return pending.content.trim()
  }
  return null
}

function resolveTurnThreadTag(args: {
  conversationId: string
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
}): ThreadTag {
  const content = resolveTurnUserContent(args)
  if (content) {
    return resolveEffectiveThreadTag(args.conversationId, content)
  }
  try {
    const msgs = getConversationStore().getMessages(args.conversationId)
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user' && msgs[i].content.trim()) {
        return resolveEffectiveThreadTag(args.conversationId, msgs[i].content)
      }
    }
  } catch {
    /* ignore store errors */
  }
  return 'general'
}

async function maybeAutoCompactConversationHistory(args: {
  conversationId: string
  userId: string
}): Promise<void> {
  try {
    await autoCompactStoredConversationIfNeeded({
      conversationId: args.conversationId,
      userId: args.userId,
      messageBudget: loadChatContextWindowMessages(),
    })
  } catch (err) {
    log.warn('Auto conversation compaction failed; continuing with full history', {
      conversationId: args.conversationId,
      err,
    })
  }
}

function persistIncomingUserMessage(args: {
  conversationId: string
  agentId: string
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
}): string | null {
  const fromUi = extractTrailingUserForPersistence(
    parseClientUiMessages(args.uiMessages),
  )
  const pending = args.pendingUserMessage
  const pendingOk =
    pending &&
    typeof pending.id === 'string' &&
    pending.id.trim().length > 0 &&
    typeof pending.content === 'string' &&
    pending.content.trim().length > 0 &&
    typeof pending.createdAt === 'string'

  const row = fromUi
    ? fromUi
    : pendingOk && pending
      ? {
          id: pending.id.trim(),
          content: pending.content.trim(),
          createdAt: pending.createdAt,
        }
      : null
  if (!row) return null

  clearPlanExecutionCompleted(args.conversationId)

  const threadTag = resolveEffectiveThreadTag(args.conversationId, row.content)

  try {
    getConversationStore().saveMessage({
      id: row.id,
      conversationId: args.conversationId,
      agentId: args.agentId,
      role: 'user',
      content: row.content,
      createdAt: row.createdAt,
      threadTag,
    })
    log.info(ConfigContext.ENGINE_LOG.PERSIST_USER_OK, {
      conversationId: args.conversationId,
      agentId: args.agentId,
      messageId: row.id,
      source: fromUi ? 'uiMessages' : 'pendingUserMessage',
    })
    return row.id
  } catch (err) {
    log.warn(ConfigContext.ENGINE_LOG.PERSIST_USER_FAIL, {
      conversationId: args.conversationId,
      err,
    })
    return null
  }
}

async function uploadUserAttachmentsBeforeAgentRun(
  args: {
    conversationId: string
    uiMessages?: unknown[]
    pendingUserMessage?: { id: string; content: string; createdAt: string }
    userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
    attachmentSourcePaths?: string[]
  },
  persistedUserMessageId: string | null,
): Promise<{ attachments: import('@shared/chat/attachments').ChatAttachmentMeta[]; error?: string }> {
  const stagedPaths = (args.attachmentSourcePaths ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
  if (stagedPaths.length > 0 && !persistedUserMessageId && !args.pendingUserMessage?.id?.trim()) {
    return {
      attachments: [],
      error: 'Could not save the user message before uploading attachments.',
    }
  }

  return ensureUserAttachmentsUploadedBeforeAgentRun({
    conversationId: args.conversationId,
    messageId: persistedUserMessageId ?? args.pendingUserMessage?.id,
    uiMessages: args.uiMessages,
    userAttachments: args.userAttachments,
    attachmentSourcePaths: args.attachmentSourcePaths,
  })
}

function persistConversationSandboxRun(payload: AgentSandboxReadyPayload): void {
  try {
    getConversationStore().upsertConversationSandboxRun({
      conversationId: payload.conversationId,
      sandboxRoot: payload.sandboxRoot,
      resultsFileUrl: payload.resultsFileUrl,
      outputResultsDir: payload.outputResultsDir,
    })
  } catch (err) {
    log.warn(ConfigContext.ENGINE_LOG.PERSIST_SANDBOX_FAIL, {
      conversationId: payload.conversationId,
      sandboxRoot: payload.sandboxRoot,
      err,
    })
  }
}

export function isConversationRunInFlight(conversationId: string): boolean {
  const id = conversationId.trim()
  if (!id) return false
  return inFlightControllers.has(id)
}

export function stopAgentForConversation(conversationId: string): void {
  const controller = inFlightControllers.get(conversationId)
  if (controller) {
    log.info(ConfigContext.ENGINE_LOG.STOP_REQUESTED, { conversationId })
    controller.abort()
  }
}

export function bindConversationAbortController(
  conversationId: string,
): AbortController {
  const controller = new AbortController()
  inFlightControllers.set(conversationId, controller)
  return controller
}

export function releaseConversationAbortController(
  conversationId: string,
): void {
  inFlightControllers.delete(conversationId)
}

export type RunAgentForConversationArgs = {
  conversationId: string
  agentId: string
  assistantMessageId: string
  userId: string
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
  userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
  attachmentSourcePaths?: string[]
  webContents?: WebContents
}

export type RunAgentForConversationResult = {
  finalContent: string
  hasError: boolean
  errorMessage?: string
  /** Pipeline paused for tool approval or form collection; stream should stay resumable. */
  hitlPaused?: boolean
}

export async function runAgentForConversation(
  args: RunAgentForConversationArgs,
): Promise<RunAgentForConversationResult> {
  return runWithAgentRunLog(
    {
      agentId: args.agentId,
      conversationId: args.conversationId,
      assistantMessageId: args.assistantMessageId,
    },
    () => executeAgentForConversation(args),
  )
}

async function executeAgentForConversation(
  args: RunAgentForConversationArgs,
): Promise<RunAgentForConversationResult> {
  const {
    conversationId,
    agentId,
    assistantMessageId,
    userId,
    uiMessages,
    pendingUserMessage,
    webContents,
  } = args

  try {
    let workspacePath: string | null = null
    try {
      workspacePath = getWorkspacePath(conversationId)
    } catch {
      workspacePath = null
    }
    await runUserHooks({
      event: 'onSessionStart',
      conversationId,
      workspacePath,
    })
  } catch {
    // Hooks are optional; do not block agent runs when misconfigured.
  }

  const persistedUserMessageId = persistIncomingUserMessage({
    conversationId,
    agentId,
    uiMessages,
    pendingUserMessage,
  })

  const attachmentResult = await uploadUserAttachmentsBeforeAgentRun(
    args,
    persistedUserMessageId,
  )
  if (attachmentResult.error) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: attachmentResult.error,
    }
  }
  const userAttachments = attachmentResult.attachments

  await maybeAutoCompactConversationHistory({ conversationId, userId })

  const agents = await ConfigContext.loadEngineAgents(userId)
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    log.error(ConfigContext.ENGINE_LOG.EXECUTION_ABORTED, {
      conversationId,
      agentId,
    })
    return {
      finalContent: '',
      hasError: true,
      errorMessage: ConfigContext.ERRORS.NOT_FOUND.replace('{agentId}', agentId),
    }
  }

  const credentials = loadAgentRunCredentials()
  // Resolve the current turn's thread tag so that loadConversationHistory can
  // filter out cross-topic messages when the user has switched subjects.
  const currentTurnTag = resolveTurnThreadTag({ conversationId, uiMessages, pendingUserMessage })
  const history = loadConversationHistory(conversationId, assistantMessageId, {
    currentTag: currentTurnTag,
  })
  const mcpTools = await loadMcpToolsForAgent(userId, agent)
  const enabledSkillTools = resolveEnabledSkillToolNames(agent)

  log.info(ConfigContext.ENGINE_LOG.PREPARED_CONTEXT, {
    conversationId,
    agentId,
    provider: agent.provider,
    model: agent.model,
    historyCount: history.length,
    mcpToolCount: mcpTools.length,
    enabledSkillToolCount:
      enabledSkillTools?.length ?? agent.availableSkillTools.length,
  })

  const abortController = new AbortController()
  inFlightControllers.set(conversationId, abortController)

  const streamBridge = createAgentStreamBridge({
    webContents,
    conversationId,
    assistantMessageId,
    onSandboxPersist: persistConversationSandboxRun,
  })

  const eventBus = createAgentEventBus()
  const detachIpcProjector = attachIpcProjector(eventBus, streamBridge)

  let finalContent = ''
  let hasError = false
  let errorMessage: string | undefined
  let shouldPersistMemory = false
  let hitlPaused = false

  try {
    const opts: AgentResponseOpts = {
      provider: agent.provider,
      model: agent.model,
      stageLlm: agent.stageLlmSettings,
      systemPrompt: agent.systemPrompt,
      responseLanguage: resolveResponseLanguageForAgent(agent.responseLanguage),
      abortSignal: abortController.signal,
      messages: history,
      executionSteps: agent.executionSteps,
      toolLoopMaxIterations:
        agent.executionSteps?.toolLoop?.maxIterations ??
        agent.toolLoopMaxIterations,
      todoMaxRetries: agent.todoMaxRetries,
      skillId: agent.skillId,
      compiledArtifact: agent.compiledArtifact,
      agentId,
      availableSet: enabledSkillTools,
      availableSetTouched: !!agent.availableSetTouched,
      toolNeedsApprovalOverrides: agent.toolNeedsApprovalOverrides ?? {},
      mcpTools,
      userId,
      conversationId,
      ...credentials,
      clientUiMessages: parseClientUiMessages(uiMessages),
      pendingUserMessage,
      assistantMessageId,
      llmDebugRunId: createLlmDebugRunId(),
      onChunk: streamBridge.onChunk,
      onUIMessageChunk: streamBridge.onUIMessageChunk,
      onStepProgress: streamBridge.onStepProgress,
      onSubAgentRunEvent: streamBridge.onSubAgentRunEvent,
      onSandboxReady: streamBridge.onSandboxReady,
      onSandboxResultWritten: streamBridge.onSandboxResultWritten,
      userAttachments,
      eventBus,
    }

    const streamResult = await streamAgentResponse(opts)
    finalContent = streamResult.structuredContent
    shouldPersistMemory = streamResult.shouldPersistMemory
    hitlPaused = streamResult.hitlPaused
    log.info(ConfigContext.ENGINE_LOG.COMPLETED, {
      conversationId,
      agentId,
      assistantMessageId,
      finalContentLength: finalContent.length,
    })
  } catch (err: unknown) {
    if (isAbortError(err)) {
      log.info(ConfigContext.ENGINE_LOG.ABORTED, {
        conversationId,
        agentId,
        assistantMessageId,
      })
      return { finalContent: '', hasError: false }
    }
    hasError = true
    errorMessage = formatLlmErrorForUi(err)
    log.error(ConfigContext.ENGINE_LOG.FAILED, {
      conversationId,
      agentId,
      assistantMessageId,
      errorMessage,
      ...llmErrorFields(err),
    })
  } finally {
    detachIpcProjector()
    inFlightControllers.delete(conversationId)
  }

  if (!hasError && finalContent.trim()) {
    const threadTag = resolveTurnThreadTag({
      conversationId,
      uiMessages,
      pendingUserMessage,
    })
    try {
      getConversationStore().saveMessage({
        id: assistantMessageId,
        conversationId,
        agentId,
        role: 'assistant',
        content: finalContent,
        createdAt: new Date().toISOString(),
        threadTag,
      })
      log.info(ConfigContext.ENGINE_LOG.PERSIST_ASSISTANT_OK, {
        conversationId,
        agentId,
        assistantMessageId,
      })
      notifyRendererConversationChanged(conversationId, agentId, webContents)
      if (shouldPersistMemory) {
        try {
          const memoryModel = ProviderContext.createModel(
            agent.provider,
            agent.model,
            credentials,
          )
          enqueueAgentMemoryExchange({
            agentId,
            conversationId,
            userId,
            assistantMessageId,
            assistantContent: finalContent,
            model: memoryModel,
            responseLanguage: resolveResponseLanguageForAgent(agent.responseLanguage),
            uiMessages,
            pendingUserMessage: args.pendingUserMessage,
          })
          log.info(
            `${ConfigContext.ENGINE_LOG.MEMORY_RECORD_ENQUEUED} conversationId=${conversationId} agentId=${agentId} assistantMessageId=${assistantMessageId}`,
          )
        } catch (memErr) {
          const errText =
            memErr instanceof Error ? memErr.message : String(memErr)
          log.warn(
            `${ConfigContext.ENGINE_LOG.MEMORY_RECORD_FAIL} conversationId=${conversationId} agentId=${agentId} assistantMessageId=${assistantMessageId} err=${errText}`,
          )
        }
      } else {
        log.info(
          `Skipped agent memory persistence conversationId=${conversationId} agentId=${agentId} assistantMessageId=${assistantMessageId}`,
        )
      }
    } catch (err) {
      log.error(ConfigContext.ENGINE_LOG.PERSIST_ASSISTANT_FAIL, {
        conversationId,
        agentId,
        assistantMessageId,
        err,
      })
    }
  }

  // Notify the renderer only after persist so ChatPanel.onFinish reload sees the
  // saved assistant row (AgentStreamFinished used to fire from `finally` before save).
  if (!hitlPaused) {
    streamBridge.notifyFinished()
  }

  return { finalContent, hasError, errorMessage, hitlPaused: hitlPaused || undefined }
}

export type RunSubAgentMentionArgs = {
  conversationId: string
  agentId: string
  assistantMessageId: string
  userId: string
  targetAgentId: string
  task: string
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
  userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
  attachmentSourcePaths?: string[]
  webContents?: WebContents
}

export async function runSubAgentMentionDelegation(
  args: RunSubAgentMentionArgs,
): Promise<RunAgentForConversationResult> {
  return runWithAgentRunLog(
    {
      agentId: args.agentId,
      conversationId: args.conversationId,
      assistantMessageId: args.assistantMessageId,
    },
    () => executeSubAgentMentionDelegation(args),
  )
}

async function executeSubAgentMentionDelegation(
  args: RunSubAgentMentionArgs,
): Promise<RunAgentForConversationResult> {
  const {
    conversationId,
    agentId,
    assistantMessageId,
    userId,
    targetAgentId,
    task,
    uiMessages,
    pendingUserMessage,
    webContents,
  } = args

  if (isPlanModeActive(conversationId)) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: '/sub-agent delegation is unavailable while plan mode is active.',
    }
  }

  const persistedUserMessageId = persistIncomingUserMessage({
    conversationId,
    agentId,
    uiMessages,
    pendingUserMessage,
  })

  const attachmentResult = await uploadUserAttachmentsBeforeAgentRun(
    args,
    persistedUserMessageId,
  )
  if (attachmentResult.error) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: attachmentResult.error,
    }
  }
  const userAttachments = attachmentResult.attachments

  await maybeAutoCompactConversationHistory({ conversationId, userId })

  const agents = await ConfigContext.loadEngineAgents(userId)
  const caller = agents.find((a) => a.id === agentId)
  if (!caller) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: ConfigContext.ERRORS.NOT_FOUND.replace('{agentId}', agentId),
    }
  }

  const delegatable = resolveDelegatableSubAgentTargets(
    {
      id: caller.id,
      allowSubAgents: caller.allowSubAgents,
      subAgentIds: caller.subAgentIds,
    },
    agents,
  )
  const targetId = targetAgentId.trim()
  if (!delegatable.some((t) => t.id === targetId)) {
    const slugs = delegatable.map((t) => `@${t.mentionSlug}`).join(', ')
    return {
      finalContent: '',
      hasError: true,
      errorMessage: slugs
        ? `Sub-agent "${targetId}" is not enabled. Available: ${slugs}`
        : 'No sub-agents are enabled for this agent.',
    }
  }

  const trimmedTask = task.trim()
  if (!trimmedTask) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: 'Sub-agent task cannot be empty.',
    }
  }

  const credentials = loadAgentRunCredentials()
  const currentTurnTag = resolveTurnThreadTag({
    conversationId,
    uiMessages,
    pendingUserMessage,
  })
  const history = loadConversationHistory(conversationId, assistantMessageId, {
    currentTag: currentTurnTag,
  })
  const mcpTools = await loadMcpToolsForAgent(userId, caller)
  const enabledSkillTools = resolveEnabledSkillToolNames(caller)

  const abortController = new AbortController()
  inFlightControllers.set(conversationId, abortController)

  const streamBridge = createAgentStreamBridge({
    webContents,
    conversationId,
    assistantMessageId,
    onSandboxPersist: persistConversationSandboxRun,
  })

  const eventBus = createAgentEventBus()
  const detachIpcProjector = attachIpcProjector(eventBus, streamBridge)

  let finalContent = ''
  let hasError = false
  let errorMessage: string | undefined
  let hitlPaused = false

  try {
    const opts: AgentResponseOpts = {
      provider: caller.provider,
      model: caller.model,
      stageLlm: caller.stageLlmSettings,
      systemPrompt: caller.systemPrompt,
      responseLanguage: resolveResponseLanguageForAgent(caller.responseLanguage),
      abortSignal: abortController.signal,
      messages: history,
      executionSteps: caller.executionSteps,
      toolLoopMaxIterations:
        caller.executionSteps?.toolLoop?.maxIterations ??
        caller.toolLoopMaxIterations,
      todoMaxRetries: caller.todoMaxRetries,
      skillId: caller.skillId,
      compiledArtifact: caller.compiledArtifact,
      agentId,
      availableSet: enabledSkillTools,
      availableSetTouched: !!caller.availableSetTouched,
      toolNeedsApprovalOverrides: caller.toolNeedsApprovalOverrides ?? {},
      mcpTools,
      userId,
      conversationId,
      ...credentials,
      clientUiMessages: parseClientUiMessages(uiMessages),
      pendingUserMessage,
      assistantMessageId,
      llmDebugRunId: createLlmDebugRunId(),
      onChunk: streamBridge.onChunk,
      onUIMessageChunk: streamBridge.onUIMessageChunk,
      onStepProgress: streamBridge.onStepProgress,
      onSubAgentRunEvent: streamBridge.onSubAgentRunEvent,
      onSandboxReady: streamBridge.onSandboxReady,
      onSandboxResultWritten: streamBridge.onSandboxResultWritten,
      userAttachments,
      eventBus,
    }

    const stageModels = StageModelRegistry.fromOpts(opts)
    const model = stageModels.getModel('default')
    const parentRun = AgentRun.startRoot(opts, model)

    const childResult = await parentRun.executeChildAndMerge({
      agentId: targetId,
      parentOpts: opts,
      task: trimmedTask,
      parentCurrentMessages: history,
    })

    hitlPaused = childResult.hitlPaused
    finalContent = mergeSubFlowOutputText(childResult.stepOutputs, 'report')

    log.info('Sub-agent mention delegation completed', {
      conversationId,
      agentId,
      targetAgentId: targetId,
      assistantMessageId,
      finalContentLength: finalContent.length,
      hitlPaused,
    })
  } catch (err: unknown) {
    if (isAbortError(err)) {
      log.info(ConfigContext.ENGINE_LOG.ABORTED, {
        conversationId,
        agentId,
        assistantMessageId,
      })
      return { finalContent: '', hasError: false }
    }
    hasError = true
    errorMessage = formatLlmErrorForUi(err)
    log.error('Sub-agent mention delegation failed', {
      conversationId,
      agentId,
      targetAgentId: targetId,
      assistantMessageId,
      errorMessage,
      ...llmErrorFields(err),
    })
  } finally {
    detachIpcProjector()
    inFlightControllers.delete(conversationId)
  }

  if (!hasError && finalContent.trim() && !hitlPaused) {
    const threadTag = resolveTurnThreadTag({
      conversationId,
      uiMessages,
      pendingUserMessage,
    })
    try {
      getConversationStore().saveMessage({
        id: assistantMessageId,
        conversationId,
        agentId,
        role: 'assistant',
        content: finalContent,
        createdAt: new Date().toISOString(),
        threadTag,
      })
      notifyRendererConversationChanged(conversationId, agentId, webContents)
    } catch (err) {
      log.error(ConfigContext.ENGINE_LOG.PERSIST_ASSISTANT_FAIL, {
        conversationId,
        agentId,
        assistantMessageId,
        err,
      })
    }
  }

  if (!hitlPaused) {
    streamBridge.notifyFinished()
  }

  return { finalContent, hasError, errorMessage, hitlPaused: hitlPaused || undefined }
}
