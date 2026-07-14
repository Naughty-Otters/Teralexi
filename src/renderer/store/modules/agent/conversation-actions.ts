import {
  classifyConversationSessionId,
  canDeleteConversationFromUi,
} from '@shared/conversation/session-id'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import { randomShortUuid } from '@shared/utils/short-uuid'
import { useWorkspaceStore } from '@store/workspace'
import { useWorkspaceGitStore } from '@store/workspace-git'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import {
  LAYOUT_PREF_KEYS,
  readStoredString,
  writeStoredString,
} from '@renderer/lib/layout-preferences'
import {
  serializeAssistantMessageForHistory,
} from './context'
import type { AgentStoreContext } from './agent-store-context'
import type { AgentPersistenceActions } from './agent-persistence'
import type { Agent, Conversation, ConversationSandboxRun, Message } from './types'

export type CreateNewConversationMode =
  | 'default'
  | 'fresh'
  | 'replicate-current'

export type CreateNewConversationOptions = {
  mode?: CreateNewConversationMode
}

export function createConversationActions(
  ctx: AgentStoreContext,
  _persistence: AgentPersistenceActions,
) {
  const {
    log,
    agents,
    conversations,
    conversationMessagePagination,
    conversationList,
    activeConversationId,
    focusedConversationId,
    channelConversationIds,
    selectedAgentId,
    activeStreamState,
    inFlightConversations,
    uiChatInFlightConversations,
    conversationSandboxRuns,
    sandboxSelectedRunIdByConversation,
    currentConversationId,
  } = ctx

  function pickDefaultChatAgentId(): string | null {
    const pickFrom = agents.value.filter(
      (agent) => agent.enabled && !isWorkflowPanelAgentId(agent.id),
    )
    const defaultAgent = pickFrom.find((agent) => agent.name === 'Default')
    return (defaultAgent ?? pickFrom[0])?.id ?? null
  }

  async function applyWorkspacePathToConversation(
    targetConversationId: string,
    path: string,
  ): Promise<void> {
    const trimmedPath = path.trim()
    const trimmedConversationId = targetConversationId.trim()
    if (!trimmedPath || !trimmedConversationId) return

    const setCh = window.ipcRendererChannel?.SetConversationWorkspace
    if (!setCh?.invoke) return
    await setCh.invoke({
      conversationId: trimmedConversationId,
      path: trimmedPath,
    })
  }

  function replicateConversationUiState(
    sourceConversationId: string,
    targetConversationId: string,
  ): void {
    const sourceId = sourceConversationId.trim()
    const targetId = targetConversationId.trim()
    if (!sourceId || !targetId || sourceId === targetId) return
    useWorkspaceNavigationStore().copyLayoutToConversation(sourceId, targetId)
    useWorkspaceGitStore().copyEditorSessionToConversation(sourceId, targetId)
  }

  function findConversationMeta(
    conversationId: string,
  ): Conversation | undefined {
    for (const convs of Object.values(conversationList.value)) {
      const hit = convs.find((c) => c.id === conversationId)
      if (hit) return hit
    }
    return undefined
  }

  function persistFocusedConversationId(conversationId: string | null): void {
    writeStoredString(LAYOUT_PREF_KEYS.lastConversationId, conversationId)
  }

  function readPersistedConversationId(): string | null {
    return readStoredString(LAYOUT_PREF_KEYS.lastConversationId)
  }

  function mostRecentConversation(): Conversation | null {
    const all = Object.values(conversationList.value).flat()
    if (all.length === 0) return null
    return (
      all
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ??
      null
    )
  }

  function stopStreaming() {
    const state = activeStreamState.value
    if (!state) return

    // Delegate stop to main process engine
    void window.ipcRendererChannel?.StopAgentForConversation?.invoke?.({
      conversationId: state.conversationId,
    })

    markAssistantMessageFinished(state.conversationId, state.assistantId)

    activeStreamState.value = null
  }

  function markUiChatInFlight(conversationId: string, inFlight: boolean): void {
    if (!conversationId.trim()) return
    if (inFlight) uiChatInFlightConversations.add(conversationId)
    else uiChatInFlightConversations.delete(conversationId)
  }

  function isConversationStreamActive(conversationId: string): boolean {
    return (
      inFlightConversations.has(conversationId) ||
      uiChatInFlightConversations.has(conversationId) ||
      activeStreamState.value?.conversationId === conversationId
    )
  }

  function markAssistantMessageFinished(
    conversationId: string,
    assistantId: string,
  ) {
    const conversation = conversations.value[conversationId] ?? []
    const msg = conversation.find((item) => item.id === assistantId)
    if (msg) {
      msg.isStreaming = false
    }

    // Be defensive: if the exact object was replaced during a refresh,
    // clear any lingering streaming flags in the same conversation.
    for (const item of conversation) {
      if (item.isStreaming) item.isStreaming = false
    }

    if (activeStreamState.value?.assistantId === assistantId) {
      activeStreamState.value = null
    }
  }

  async function selectAgent(agentId: string) {
    const convId = focusedConversationId.value
    if (convId) {
      await assignAgentToConversation(convId, agentId)
      return
    }
    selectedAgentId.value = agentId
    if (!conversationList.value[agentId]) {
      await loadConversationList(agentId)
    }
  }

  async function fetchConversationMeta(
    conversationId: string,
  ): Promise<Conversation | undefined> {
    const channel = window.ipcRendererChannel?.GetConversationMeta
    if (!channel?.invoke) return undefined
    const row = await channel.invoke({ conversationId })
    if (!row) return undefined
    const meta: Conversation = {
      id: row.id,
      agentId: row.agentId,
      title: row.title,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      type: classifyConversationSessionId(row.id),
    }
    const list = conversationList.value[meta.agentId] ?? []
    if (!list.some((c) => c.id === conversationId)) {
      conversationList.value = {
        ...conversationList.value,
        [meta.agentId]: [meta, ...list],
      }
    }
    return meta
  }

  async function syncSelectedAgentFromConversation(
    conversationId: string,
  ): Promise<void> {
    let meta = findConversationMeta(conversationId)
    if (!meta) {
      meta = await fetchConversationMeta(conversationId)
    }
    if (!meta?.agentId) return

    if (selectedAgentId.value !== meta.agentId) {
      selectedAgentId.value = meta.agentId
    }
    if (!conversationList.value[meta.agentId]) {
      await loadConversationList(meta.agentId)
    }
    activeConversationId.value = {
      ...activeConversationId.value,
      [meta.agentId]: conversationId,
    }
  }

  async function assignAgentToConversation(
    conversationId: string,
    agentId: string,
  ): Promise<void> {
    const trimmedAgentId = agentId.trim()
    if (!trimmedAgentId) return

    const existing = findConversationMeta(conversationId)
    if (existing?.agentId === trimmedAgentId) {
      selectedAgentId.value = trimmedAgentId
      activeConversationId.value = {
        ...activeConversationId.value,
        [trimmedAgentId]: conversationId,
      }
      if (!conversationList.value[trimmedAgentId]) {
        await loadConversationList(trimmedAgentId)
      }
      return
    }

    const channel = window.ipcRendererChannel?.UpdateConversationAgent
    if (channel?.invoke) {
      await channel.invoke({
        conversationId,
        agentId: trimmedAgentId,
      })
    }

    selectedAgentId.value = trimmedAgentId

    if (existing && existing.agentId !== trimmedAgentId) {
      const oldAgentId = existing.agentId
      const list = conversationList.value[oldAgentId] ?? []
      const conv =
        list.find((c) => c.id === conversationId) ?? { ...existing }
      const updated: Conversation = {
        ...conv,
        agentId: trimmedAgentId,
        updatedAt: new Date(),
      }
      conversationList.value = {
        ...conversationList.value,
        [oldAgentId]: list.filter((c) => c.id !== conversationId),
        [trimmedAgentId]: [
          updated,
          ...(conversationList.value[trimmedAgentId] ?? []).filter(
            (c) => c.id !== conversationId,
          ),
        ],
      }
      if (activeConversationId.value[oldAgentId] === conversationId) {
        const nextActive = { ...activeConversationId.value }
        delete nextActive[oldAgentId]
        activeConversationId.value = nextActive
      }
    } else if (!existing) {
      await fetchConversationMeta(conversationId)
    }

    activeConversationId.value = {
      ...activeConversationId.value,
      [trimmedAgentId]: conversationId,
    }

    if (!conversationList.value[trimmedAgentId]) {
      await loadConversationList(trimmedAgentId)
    }
  }

  async function loadConversationList(agentId: string): Promise<void> {
    const channel = window.ipcRendererChannel?.ListConversations
    if (!channel?.invoke) {
      conversationList.value[agentId] = []
      return
    }
    const stored = await channel.invoke({ agentId })
    conversationList.value[agentId] = stored.map(
      (c: {
        id: string
        agentId: string
        title: string
        createdAt: string
        updatedAt: string
      }) => ({
        id: c.id,
        agentId: c.agentId,
        title: c.title,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        type: classifyConversationSessionId(c.id),
      }),
    )
  }

  type IpcStoredMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }

  function mapIpcStoredMessage(m: IpcStoredMessage): Message {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: new Date(m.createdAt),
    }
  }

  function mergeMessagesByIdChronological(
    existing: Message[],
    incoming: Message[],
  ): Message[] {
    const byId = new Map<string, Message>()
    for (const m of existing) byId.set(m.id, m)
    for (const m of incoming) byId.set(m.id, m)
    return [...byId.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )
  }

  /**
   * Fetches messages for `conversationId` from IPC and stores them in
   * `conversations`. Falls back to an empty array when IPC is unavailable.
   */
  async function loadConversationMessages(
    conversationId: string,
  ): Promise<void> {
    const pageChannel = window.ipcRendererChannel?.GetConversationMessagesPage
    if (pageChannel?.invoke) {
      const page = await pageChannel.invoke({ conversationId, limit: 40 })
      conversations.value[conversationId] = page.messages.map(mapIpcStoredMessage)
      conversationMessagePagination.value[conversationId] = {
        hasOlder: page.hasOlder,
      }
    } else {
      const channel = window.ipcRendererChannel?.GetConversation
      if (channel?.invoke) {
        const stored = await channel.invoke({ conversationId })
        conversations.value[conversationId] = stored.map(mapIpcStoredMessage)
      } else {
        conversations.value[conversationId] = []
      }
      conversationMessagePagination.value[conversationId] = { hasOlder: false }
    }

    const sandboxChannel = window.ipcRendererChannel?.GetConversationSandboxRuns
    if (sandboxChannel?.invoke) {
      try {
        const rows = await sandboxChannel.invoke({ conversationId })
        if (Array.isArray(rows)) {
          const tabs: ConversationSandboxRun[] = rows.map((r, i) => ({
            id: r.sandboxRoot,
            label: `Run ${i + 1}`,
            resultsFileUrl: r.resultsFileUrl,
            outputResultsDir: r.outputResultsDir,
            sandboxRoot: r.sandboxRoot,
          }))
          conversationSandboxRuns.value = {
            ...conversationSandboxRuns.value,
            [conversationId]: tabs,
          }
        }
      } catch (err) {
        log.warn('GetConversationSandboxRuns failed', {
          conversationId,
          err,
        })
      }
    }

    log.info('Loaded conversation messages', {
      conversationId,
      messageCount: conversations.value[conversationId]?.length ?? 0,
      hasOlder:
        conversationMessagePagination.value[conversationId]?.hasOlder ?? false,
      sandboxRunCount:
        conversationSandboxRuns.value[conversationId]?.length ?? 0,
    })
  }

  /** Merge the latest page from disk without dropping prepended older history. */
  async function refreshConversationMessagesTail(
    conversationId: string,
  ): Promise<void> {
    const pageChannel = window.ipcRendererChannel?.GetConversationMessagesPage
    if (!pageChannel?.invoke) {
      await loadConversationMessages(conversationId)
      return
    }

    const page = await pageChannel.invoke({ conversationId, limit: 40 })
    const incoming = page.messages.map(mapIpcStoredMessage)
    const existing = conversations.value[conversationId] ?? []

    if (incoming.length === 0) {
      if (existing.length === 0) {
        conversations.value[conversationId] = []
      }
      return
    }

    const oldestOnPage = incoming[0]!.createdAt.getTime()
    const olderPrefix = existing.filter(
      (m) => m.createdAt.getTime() < oldestOnPage,
    )
    const merged =
      olderPrefix.length > 0
        ? mergeMessagesByIdChronological(olderPrefix, incoming)
        : incoming

    conversations.value[conversationId] = merged
    conversationMessagePagination.value[conversationId] = {
      hasOlder:
        olderPrefix.length > 0 || page.hasOlder,
    }
  }

  async function loadOlderConversationMessages(
    conversationId: string,
  ): Promise<boolean> {
    const pagination = conversationMessagePagination.value[conversationId]
    if (pagination && !pagination.hasOlder) return false

    const list = conversations.value[conversationId] ?? []
    const oldest = list[0]
    if (!oldest) return false

    const pageChannel = window.ipcRendererChannel?.GetConversationMessagesPage
    if (!pageChannel?.invoke) return false

    const page = await pageChannel.invoke({
      conversationId,
      before: oldest.createdAt.toISOString(),
      limit: 40,
    })
    if (page.messages.length === 0) {
      conversationMessagePagination.value[conversationId] = { hasOlder: false }
      return false
    }

    const incoming = page.messages.map(mapIpcStoredMessage)
    conversations.value[conversationId] = mergeMessagesByIdChronological(
      list,
      incoming,
    )
    conversationMessagePagination.value[conversationId] = {
      hasOlder: page.hasOlder,
    }
    return true
  }

  function conversationHasOlderMessages(conversationId: string): boolean {
    return conversationMessagePagination.value[conversationId]?.hasOlder ?? false
  }

  /**
   * Builds the message history for a conversation, serializing assistant
   * messages for the model and excluding empty messages.
   * Pass `excludeId` to omit the current in-progress assistant placeholder.
   */
  function buildConversationHistory(
    conversationId: string,
    excludeId?: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return (conversations.value[conversationId] ?? [])
      .filter((m) => m.id !== excludeId && m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content:
          m.role === 'assistant'
            ? serializeAssistantMessageForHistory(m.content)
            : m.content,
      }))
  }

  /**
   * Returns the message with `assistantId` in `conversationId`.
   * If the conversation array doesn't exist yet it is created.
   * If no message with that id is found, a new streaming assistant placeholder
   * is pushed and returned.
   */
  function getOrCreateAssistantMessage(
    conversationId: string,
    assistantId: string = randomShortUuid(),
    defaults?: Partial<Omit<Message, 'id' | 'role'>>,
  ): Message {
    if (!conversations.value[conversationId]) {
      conversations.value[conversationId] = []
    }
    const existing = conversations.value[conversationId].find(
      (m) => m.id === assistantId,
    )
    if (existing) return existing

    const created: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
      ...defaults,
    }
    conversations.value[conversationId].push(created)
    return created
  }

  function removeAssistantMessageFromConversation(
    conversationId: string,
    messageId: string,
  ): void {
    const list = conversations.value[conversationId]
    if (!list) return
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx >= 0) list.splice(idx, 1)
  }

  async function selectConversation(
    conversationId: string,
    forceReload = false,
  ): Promise<void> {
    focusedConversationId.value = conversationId
    persistFocusedConversationId(conversationId)
    await syncSelectedAgentFromConversation(conversationId)
    // Load messages if not cached
    if (forceReload || !conversations.value[conversationId]) {
      // Never replace an array that belongs to an in-flight stream — doing so
      // would wipe the assistant placeholder and cause getMsg() to return null.
      if (forceReload && isConversationStreamActive(conversationId)) {
        return
      }
      log.info('Loading conversation into renderer store', {
        conversationId,
        forceReload,
        hasActiveStream: isConversationStreamActive(conversationId),
      })

      await loadConversationMessages(conversationId)
    }
  }

  async function createNewConversation(
    title?: string,
    options?: CreateNewConversationOptions,
  ): Promise<Conversation | null> {
    const mode = options?.mode ?? 'default'
    const workspaceStore = useWorkspaceStore()
    let agentId: string | null = null
    let workspacePathToApply: string | null = null
    let sourceConversationId: string | null = null

    if (mode === 'replicate-current') {
      sourceConversationId = currentConversationId.value?.trim() || null
      const meta = sourceConversationId
        ? findConversationMeta(sourceConversationId)
        : undefined
      agentId = meta?.agentId ?? selectedAgentId.value
      workspacePathToApply = workspaceStore.activeWorkspacePath?.trim() || null
    } else if (mode === 'fresh') {
      workspaceStore.pendingWorkspacePath = null
      agentId = pickDefaultChatAgentId()
      if (agentId) selectedAgentId.value = agentId
    } else {
      agentId = selectedAgentId.value
    }

    if (!agentId) return null
    const now = new Date()
    const conv: Conversation = {
      id: randomShortUuid(),
      agentId,
      title: title ?? 'New Conversation',
      createdAt: now,
      updatedAt: now,
      type: 'ui',
    }
    const channel = window.ipcRendererChannel?.CreateConversation
    if (channel?.invoke) {
      await channel.invoke({
        id: conv.id,
        agentId: conv.agentId,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
      })
    }
    conversations.value[conv.id] = []
    conversationList.value[agentId] = [
      conv,
      ...(conversationList.value[agentId] ?? []),
    ]
    await workspaceStore.commitPendingWorkspace(conv.id)
    if (workspacePathToApply) {
      await applyWorkspacePathToConversation(conv.id, workspacePathToApply)
    }
    if (sourceConversationId) {
      replicateConversationUiState(sourceConversationId, conv.id)
    }
    focusedConversationId.value = conv.id
    persistFocusedConversationId(conv.id)
    activeConversationId.value[agentId] = conv.id
    return conv
  }

  async function renameConversation(
    conversationId: string,
    title: string,
  ): Promise<void> {
    const meta = findConversationMeta(conversationId)
    const agentId = meta?.agentId ?? selectedAgentId.value
    if (!agentId) return
    const channel = window.ipcRendererChannel?.UpdateConversationTitle
    if (channel?.invoke) await channel.invoke({ conversationId, title })
    const list = conversationList.value[agentId]
    if (list) {
      const conv = list.find((c) => c.id === conversationId)
      if (conv) {
        conv.title = title
        conv.updatedAt = new Date()
      }
    }
  }

  async function resolveAgentAndEnsureConversationLoaded(
    conversationId: string,
    agentId: string,
    forceReloadConversation = false,
  ): Promise<Agent | null> {
    const agent = agents.value.find((a) => a.id === agentId)
    log.info('Resolved agent for conversation run', {
      conversationId,
      agentId,
      found: !!agent,
      agentName: agent?.name,
    })

    if (!agent) {
      log.error('Agent not found for conversation run', {
        conversationId,
        agentId,
      })
      return null
    }

    if (forceReloadConversation || !conversations.value[conversationId]) {
      log.info('Loading conversation history before run', {
        conversationId,
        agentId,
        forceReloadConversation,
      })
      await loadConversationMessages(conversationId)
    }

    return agent
  }

  async function deleteConversation(conversationId: string): Promise<void> {
    if (!canDeleteConversationFromUi(conversationId)) {
      log.warn('Refusing to delete scheduler session', {
        conversationId,
      })
      return
    }
    const delChannel = window.ipcRendererChannel?.DeleteConversation
    if (delChannel?.invoke) {
      try {
        await delChannel.invoke({ conversationId })
      } catch (err) {
        log.warn('DeleteConversation failed', { conversationId, err })
        return
      }
    }

    const nextSandbox = { ...conversationSandboxRuns.value }
    delete nextSandbox[conversationId]
    conversationSandboxRuns.value = nextSandbox

    const nextSel = { ...sandboxSelectedRunIdByConversation.value }
    delete nextSel[conversationId]
    sandboxSelectedRunIdByConversation.value = nextSel

    const meta = findConversationMeta(conversationId)
    const ownerAgentId = meta?.agentId
    delete conversations.value[conversationId]
    if (channelConversationIds.value.has(conversationId)) {
      const nextChannelIds = new Set(channelConversationIds.value)
      nextChannelIds.delete(conversationId)
      channelConversationIds.value = nextChannelIds
    }
    if (ownerAgentId) {
      conversationList.value[ownerAgentId] = (
        conversationList.value[ownerAgentId] ?? []
      ).filter((c) => c.id !== conversationId)
      if (activeConversationId.value[ownerAgentId] === conversationId) {
        delete activeConversationId.value[ownerAgentId]
      }
    }
    if (focusedConversationId.value === conversationId) {
      const recent = mostRecentConversation()
      if (recent && recent.id !== conversationId) {
        await selectConversation(recent.id)
      } else {
        focusedConversationId.value = null
        persistFocusedConversationId(null)
      }
    }
  }

  async function clearConversationHistory(conversationId: string): Promise<void> {
    const channel = window.ipcRendererChannel?.ClearConversationHistory
    if (channel?.invoke) {
      try {
        await channel.invoke({ conversationId })
      } catch (err) {
        log.warn('ClearConversationHistory failed', { conversationId, err })
        return
      }
    }

    conversations.value[conversationId] = []
    conversationMessagePagination.value = {
      ...conversationMessagePagination.value,
      [conversationId]: { hasOlder: false },
    }
    conversationSandboxRuns.value = {
      ...conversationSandboxRuns.value,
      [conversationId]: [],
    }
    const nextSel = { ...sandboxSelectedRunIdByConversation.value }
    delete nextSel[conversationId]
    sandboxSelectedRunIdByConversation.value = nextSel
  }
  return {
    findConversationMeta,
    mostRecentConversation,
    readPersistedConversationId,
    stopStreaming,
    markUiChatInFlight,
    isConversationStreamActive,
    markAssistantMessageFinished,
    selectAgent,
    fetchConversationMeta,
    syncSelectedAgentFromConversation,
    assignAgentToConversation,
    loadConversationList,
    loadConversationMessages,
    refreshConversationMessagesTail,
    loadOlderConversationMessages,
    conversationHasOlderMessages,
    buildConversationHistory,
    getOrCreateAssistantMessage,
    removeAssistantMessageFromConversation,
    selectConversation,
    createNewConversation,
    renameConversation,
    resolveAgentAndEnsureConversationLoaded,
    deleteConversation,
    clearConversationHistory,
  }
}

export type ConversationActions = ReturnType<typeof createConversationActions>
