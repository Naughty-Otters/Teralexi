import type Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve, sep } from 'path'
import { getTeralexiDbPath, getTeralexiWorkspacePath } from '@config/teralexi-home'
import { openAppSqliteDatabase } from '../sqlite/open-app-database'
import { appCache } from '@main/cache/app-cache'

import { AgentConfigurationsRepository } from './agent-configurations-repository'
import { ConversationsRepository } from './conversations-repository'
import { McpServersRepository } from './mcp-servers-repository'
import { MessagesRepository } from './messages-repository'
import { runMigrations } from './migrations'
import { SandboxRunsRepository } from './sandbox-runs-repository'
import { SchedulersRepository } from './schedulers-repository'
import { TokenUsageRepository } from './token-usage-repository'
import { UserPropertiesRepository } from './user-properties-repository'
import { SkillCompilationsRepository } from './skill-compilations-repository'
import { ToolResultsRepository } from './tool-results-repository'
import { ConversationSettingsRepository } from './conversation-settings-repository'
import { WorkflowsRepository } from './workflows-repository'
import { MessageAttachmentsRepository } from './message-attachments-repository'
import type {
  MessageSearchHit,
  StoredAgentConfiguration,
  StoredConversation,
  StoredConversationSettings,
  StoredConversationSandboxRun,
  StoredMcpServer,
  StoredMessage,
  StoredSchedulerDefinition,
  StoredTokenUsageRecord,
  StoredToolResult,
  StoredUserProperty,
  StoredSkillCompilation,
  TokenUsageChartSeries,
  TokenUsageDashboard,
  ToolResultSearchHit,
  StoredWorkflow,
  StoredWorkflowVersion,
  StoredWorkflowDeployment,
  StoredWorkflowTrigger,
  StoredMessageAttachment,
} from './types'
import type { SkillCompilationSource } from '@main/skills/skill-compiled-schema'
import type { SkillCompiledArtifact } from '@main/skills/skill-compiled-schema'
import { randomShortUuid } from '@shared/utils/short-uuid'

/**
 * Facade over the SQLite-backed app store. Delegates each domain to a focused repository;
 * preserves the original flat method surface so existing callers do not need to change.
 */
export class ConversationStore {
  private readonly db: Database.Database
  private readonly conversations: ConversationsRepository
  private readonly messages: MessagesRepository
  private readonly sandboxRuns: SandboxRunsRepository
  private readonly agentConfigurations: AgentConfigurationsRepository
  private readonly schedulers: SchedulersRepository
  private readonly mcpServers: McpServersRepository
  private readonly userProperties: UserPropertiesRepository
  private readonly tokenUsage: TokenUsageRepository
  private readonly skillCompilations: SkillCompilationsRepository
  private readonly toolResults: ToolResultsRepository
  private readonly conversationSettings: ConversationSettingsRepository
  private readonly workflows: WorkflowsRepository
  private readonly messageAttachments: MessageAttachmentsRepository

  constructor() {
    const dbPath = getTeralexiDbPath()
    const defaultWorkspacePath = getTeralexiWorkspacePath()
    this.db = openAppSqliteDatabase(dbPath)
    runMigrations(this.db)

    this.conversations = new ConversationsRepository(this.db)
    this.messages = new MessagesRepository(this.db, this.conversations)
    this.sandboxRuns = new SandboxRunsRepository(this.db)
    this.agentConfigurations = new AgentConfigurationsRepository(this.db)
    this.schedulers = new SchedulersRepository(this.db)
    this.mcpServers = new McpServersRepository(this.db)
    this.userProperties = new UserPropertiesRepository(
      this.db,
      defaultWorkspacePath,
    )
    this.tokenUsage = new TokenUsageRepository(this.db)
    this.skillCompilations = new SkillCompilationsRepository(this.db)
    this.toolResults = new ToolResultsRepository(this.db)
    this.conversationSettings = new ConversationSettingsRepository(this.db)
    this.workflows = new WorkflowsRepository(this.db)
    this.messageAttachments = new MessageAttachmentsRepository(this.db)

    this.userProperties.ensureDefaults('default')
    this.mcpServers.ensureReferenceServers(
      'default',
      this.userProperties.getWorkspacePath('default'),
    )
  }

  // ── Conversation settings ─────────────────────────────────────────────────

  getConversationSettings(
    conversationId: string,
  ): StoredConversationSettings | null {
    return this.conversationSettings.get(conversationId)
  }

  setConversationWorkspacePath(
    conversationId: string,
    workspacePath: string | null,
  ): StoredConversationSettings {
    return this.conversationSettings.setWorkspacePath(
      conversationId,
      workspacePath,
    )
  }

  clearConversationWorkspace(conversationId: string): void {
    this.conversationSettings.clear(conversationId)
  }

  getSessionApprovedTools(conversationId: string): string[] {
    return this.conversationSettings.getSessionApprovedTools(conversationId)
  }

  addSessionApprovedTool(conversationId: string, toolName: string): string[] {
    return this.conversationSettings.addSessionApprovedTool(
      conversationId,
      toolName,
    )
  }

  getConversationCodingMode(conversationId: string) {
    return this.conversationSettings.getCodingMode(conversationId)
  }

  setConversationCodingMode(
    conversationId: string,
    codingMode: StoredConversationSettings['codingMode'],
  ): StoredConversationSettings {
    return this.conversationSettings.setCodingMode(conversationId, codingMode)
  }

  getConversationPlanModeState(conversationId: string) {
    return this.conversationSettings.getPlanModeState(conversationId)
  }

  setConversationPlanModeState(
    conversationId: string,
    planModeState: StoredConversationSettings['planModeState'],
  ): StoredConversationSettings {
    return this.conversationSettings.setPlanModeState(
      conversationId,
      planModeState,
    )
  }

  getConversationHooks(conversationId: string) {
    return this.conversationSettings.getHooks(conversationId)
  }

  setConversationHooks(
    conversationId: string,
    hooks: StoredConversationSettings['hooks'],
  ): StoredConversationSettings {
    return this.conversationSettings.setHooks(conversationId, hooks)
  }

  getConversationLlmOverride(conversationId: string) {
    return this.conversationSettings.getLlmOverride(conversationId)
  }

  setConversationLlmOverride(
    conversationId: string,
    llmOverride: StoredConversationSettings['llmOverride'],
  ): StoredConversationSettings {
    return this.conversationSettings.setLlmOverride(conversationId, llmOverride)
  }

  applyCompactionToConversation(args: {
    conversationId: string
    agentId: string
    deleteMessageIds: string[]
    compactionNote: string
    anchorCreatedAt?: string
    threadTag?: string
  }): void {
    const tx = this.db.transaction(() => {
      this.messages.deleteByIds(args.deleteMessageIds)
      const anchorMs = args.anchorCreatedAt
        ? new Date(args.anchorCreatedAt).getTime()
        : Date.now()
      const noteCreatedAt = new Date(anchorMs - 1).toISOString()
      this.messages.save({
        id: randomShortUuid(),
        conversationId: args.conversationId,
        agentId: args.agentId,
        role: 'user',
        content: args.compactionNote,
        createdAt: noteCreatedAt,
        threadTag: args.threadTag ?? 'general',
      })
      this.conversations.touch(args.conversationId)
    })
    tx()
  }

  // ── Skill compilations ───────────────────────────────────────────────────

  getSkillCompilation(
    skillId: string,
    source: SkillCompilationSource,
  ): StoredSkillCompilation | null {
    return this.skillCompilations.get(skillId, source)
  }

  getEffectiveSkillCompilation(skillId: string): StoredSkillCompilation | null {
    return this.skillCompilations.getEffective(skillId)
  }

  upsertSkillCompilation(args: {
    skillId: string
    source: SkillCompilationSource
    sourceFingerprint: string
    status: import('@main/skills/skill-compiled-schema').SkillCompilationStatus
    compiled: SkillCompiledArtifact | null
    errorMessage: string | null
    compiledAt: string | null
  }): StoredSkillCompilation {
    const result = this.skillCompilations.upsert(args)
    // Skill compilations affect merged agent definitions from loadEngineAgents.
    appCache.invalidateAllAgents()
    return result
  }

  // ── Conversations ────────────────────────────────────────────────────────

  listConversations(agentId: string): StoredConversation[] {
    return this.conversations.list(agentId)
  }

  getConversation(conversationId: string): StoredConversation | null {
    return this.conversations.get(conversationId)
  }

  createConversation(conv: StoredConversation): StoredConversation {
    return this.conversations.create(conv)
  }

  updateConversationTitle(conversationId: string, title: string): void {
    this.conversations.updateTitle(conversationId, title)
  }

  updateConversationAgent(conversationId: string, agentId: string): void {
    this.conversations.updateAgentId(conversationId, agentId)
  }

  touchConversation(conversationId: string): void {
    this.conversations.touch(conversationId)
  }

  deleteConversation(conversationId: string): void {
    this.conversations.delete(conversationId)
  }

  /** Remove chat messages and tool results; keep conversation row and settings (workspace, agent). */
  clearConversationHistory(conversationId: string): void {
    this.messages.deleteAllForConversation(conversationId)
    this.toolResults.deleteAllForConversation(conversationId)
  }

  // ── Sandbox runs ─────────────────────────────────────────────────────────

  upsertConversationSandboxRun(payload: {
    conversationId: string
    sandboxRoot: string
    resultsFileUrl: string
    outputResultsDir: string
  }): void {
    this.sandboxRuns.upsert(payload)
  }

  listSandboxRootsForConversation(conversationId: string): string[] {
    return this.sandboxRuns.listRootsForConversation(conversationId)
  }

  listSandboxRunsForConversation(
    conversationId: string,
  ): StoredConversationSandboxRun[] {
    return this.sandboxRuns.listForConversation(conversationId)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  getMessages(conversationId: string): StoredMessage[] {
    return this.messages.list(conversationId)
  }

  getMessagesPage(
    conversationId: string,
    opts: { before?: string; limit?: number } = {},
  ): { messages: StoredMessage[]; hasOlder: boolean } {
    return this.messages.listPage(conversationId, opts)
  }

  saveMessage(msg: StoredMessage): void {
    this.messages.save(msg)
  }

  messageExists(messageId: string): boolean {
    return this.messages.exists(messageId)
  }

  updateMessage(id: string, content: string): void {
    this.messages.update(id, content)
  }

  searchMessages(
    query: string,
    opts: { conversationId?: string; agentId?: string; limit?: number } = {},
  ): MessageSearchHit[] {
    return this.messages.search(query, opts)
  }

  insertMessageAttachments(rows: StoredMessageAttachment[]): void {
    this.messageAttachments.insertMany(rows)
  }

  getMessageAttachmentsForMessage(messageId: string): StoredMessageAttachment[] {
    return this.messageAttachments.listForMessage(messageId)
  }

  getMessageAttachmentsForConversation(
    conversationId: string,
  ): StoredMessageAttachment[] {
    return this.messageAttachments.listForConversation(conversationId)
  }

  searchMessageAttachments(
    conversationId: string,
    query: string,
    limit = 20,
  ): StoredMessageAttachment[] {
    return this.messageAttachments.searchForConversation(
      conversationId,
      query,
      limit,
    )
  }

  // ── Tool results ──────────────────────────────────────────────────────────

  saveToolResult(result: StoredToolResult): void {
    this.toolResults.save(result)
  }

  listToolResults(
    conversationId: string,
    opts: { limit?: number; toolName?: string } = {},
  ): StoredToolResult[] {
    return this.toolResults.list(conversationId, opts)
  }

  searchToolResults(
    query: string,
    opts: { conversationId?: string; limit?: number } = {},
  ): ToolResultSearchHit[] {
    return this.toolResults.search(query, opts)
  }

  getOlderToolResults(
    conversationId: string,
    keepRecentN: number,
    opts: { currentThreadTag?: string; crossThreadKeepN?: number } = {},
  ): StoredToolResult[] {
    return this.toolResults.getOlderThan(conversationId, keepRecentN, opts)
  }

  listMessagesByThread(
    conversationId: string,
    threadTag: string,
    opts: { before?: string; limit?: number } = {},
  ): StoredMessage[] {
    return this.messages.listByThread(conversationId, threadTag, opts)
  }

  getMessageThreadTagCounts(
    conversationId: string,
  ): Array<{ threadTag: string; count: number }> {
    return this.messages.getThreadTagCounts(conversationId)
  }

  // ── Agent configurations ─────────────────────────────────────────────────

  listAgentConfigurations(userId: string): StoredAgentConfiguration[] {
    return this.agentConfigurations.list(userId)
  }

  upsertAgentConfiguration(
    config: Omit<StoredAgentConfiguration, 'createdAt' | 'updatedAt'>,
  ): void {
    this.agentConfigurations.upsert(config)
    appCache.invalidateAgents(config.userId)
  }

  deleteAgentConfiguration(agentId: string, userId: string): void {
    this.agentConfigurations.delete(agentId, userId)
    appCache.invalidateAgents(userId)
  }

  deleteSkillCompilations(skillId: string): void {
    this.skillCompilations.deleteAllForSkill(skillId)
  }

  // ── Schedulers ───────────────────────────────────────────────────────────

  listSchedulers(userId: string): StoredSchedulerDefinition[] {
    return this.schedulers.list(userId)
  }

  upsertScheduler(
    scheduler: Omit<
      StoredSchedulerDefinition,
      'createdAt' | 'updatedAt' | 'lastRunAt'
    >,
  ): void {
    this.schedulers.upsert(scheduler)
  }

  deleteScheduler(userId: string, schedulerId: string): void {
    this.schedulers.delete(userId, schedulerId)
  }

  setSchedulerLastRunAt(schedulerId: string, ranAtIso: string): void {
    this.schedulers.setLastRunAt(schedulerId, ranAtIso)
  }

  setSchedulerConversationId(schedulerId: string, conversationId: string): void {
    this.schedulers.setConversationId(schedulerId, conversationId)
  }

  // ── Workflows ────────────────────────────────────────────────────────────

  listWorkflows(userId: string): StoredWorkflow[] {
    return this.workflows.list(userId)
  }

  getWorkflow(workflowId: string): StoredWorkflow | null {
    return this.workflows.get(workflowId)
  }

  upsertWorkflow(
    workflow: Omit<StoredWorkflow, 'createdAt' | 'updatedAt'> & {
      createdAt?: string
    },
  ): StoredWorkflow {
    return this.workflows.upsert(workflow)
  }

  deleteWorkflow(userId: string, workflowId: string): void {
    this.workflows.delete(userId, workflowId)
  }

  insertWorkflowVersion(
    version: Omit<StoredWorkflowVersion, 'createdAt'>,
  ): StoredWorkflowVersion {
    return this.workflows.insertVersion(version)
  }

  getWorkflowVersion(versionId: string): StoredWorkflowVersion | null {
    return this.workflows.getVersion(versionId)
  }

  listWorkflowVersions(workflowId: string): StoredWorkflowVersion[] {
    return this.workflows.listVersions(workflowId)
  }

  nextWorkflowVersionNumber(workflowId: string): number {
    return this.workflows.nextVersionNumber(workflowId)
  }

  upsertWorkflowDeployment(
    deployment: Omit<
      StoredWorkflowDeployment,
      'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastError'
    > & {
      lastRunAt?: string | null
      lastError?: string | null
    },
  ): StoredWorkflowDeployment {
    return this.workflows.upsertDeployment(deployment)
  }

  getWorkflowDeployment(deploymentId: string): StoredWorkflowDeployment | null {
    return this.workflows.getDeployment(deploymentId)
  }

  listWorkflowDeployments(workflowId: string): StoredWorkflowDeployment[] {
    return this.workflows.listDeployments(workflowId)
  }

  listEnabledLocalWorkflowDeployments(
    userId: string,
  ): StoredWorkflowDeployment[] {
    return this.workflows.listEnabledLocalDeployments(userId)
  }

  setWorkflowDeploymentLastRun(
    deploymentId: string,
    ranAtIso: string,
    error: string | null,
  ): void {
    this.workflows.setDeploymentLastRun(deploymentId, ranAtIso, error)
  }

  deleteWorkflowDeployment(deploymentId: string): void {
    this.workflows.deleteDeployment(deploymentId)
  }

  replaceWorkflowTriggers(
    workflowId: string,
    deploymentId: string | null,
    triggers: Array<
      Omit<
        StoredWorkflowTrigger,
        'createdAt' | 'updatedAt' | 'workflowId' | 'deploymentId'
      >
    >,
  ): StoredWorkflowTrigger[] {
    return this.workflows.replaceTriggers(workflowId, deploymentId, triggers)
  }

  listWorkflowTriggers(workflowId: string): StoredWorkflowTrigger[] {
    return this.workflows.listTriggers(workflowId)
  }

  listEnabledChannelMessageWorkflowTriggers(): StoredWorkflowTrigger[] {
    return this.workflows.listEnabledChannelMessageTriggers()
  }

  // ── MCP servers ──────────────────────────────────────────────────────────

  listMcpServers(userId: string): StoredMcpServer[] {
    this.mcpServers.ensureReferenceServers(
      userId,
      this.userProperties.getWorkspacePath(userId),
    )
    return this.mcpServers.list(userId)
  }

  getMcpServer(userId: string, serverId: string): StoredMcpServer | null {
    return this.mcpServers.get(userId, serverId)
  }

  createMcpServer(
    server: Omit<StoredMcpServer, 'createdAt' | 'updatedAt'>,
  ): StoredMcpServer {
    const result = this.mcpServers.create(server)
    appCache.invalidateAllMcpTools()
    return result
  }

  setMcpServerEnabled(
    userId: string,
    serverId: string,
    enabled: boolean,
  ): void {
    this.mcpServers.setEnabled(userId, serverId, enabled)
    appCache.invalidateAllMcpTools()
  }

  deleteMcpServer(userId: string, serverId: string): void {
    this.mcpServers.delete(userId, serverId)
    appCache.invalidateAllMcpTools()
  }

  // ── User properties ──────────────────────────────────────────────────────

  listUserProperties(userId: string): StoredUserProperty[] {
    return this.userProperties.list(userId)
  }

  getUserPropertiesMap(userId: string): Record<string, string> {
    return this.userProperties.getAllAsMap(userId)
  }

  getUserProperty(
    userId: string,
    propertyKey: string,
  ): StoredUserProperty | null {
    return this.userProperties.get(userId, propertyKey)
  }

  setUserProperty(
    userId: string,
    propertyKey: string,
    propertyValue: string,
  ): void {
    this.userProperties.set(userId, propertyKey, propertyValue)
  }

  deleteUserProperty(userId: string, propertyKey: string): void {
    this.userProperties.delete(userId, propertyKey)
  }

  clearUserProperties(userId: string): void {
    this.userProperties.clear(userId)
  }

  // ── User workspace file write ────────────────────────────────────────────

  saveDataToFile(userId: string, relativePath: string, data: unknown): string {
    const cleanRelativePath = relativePath.trim()
    if (!cleanRelativePath) {
      throw new Error('relativePath is required')
    }

    const workspacePath = this.userProperties.getWorkspacePath(userId)
    const workspaceRoot = resolve(workspacePath)
    const targetPath = resolve(workspaceRoot, cleanRelativePath)
    const workspacePrefix = workspaceRoot.endsWith(sep)
      ? workspaceRoot
      : `${workspaceRoot}${sep}`

    // Disallow writing outside the user workspace folder.
    if (
      targetPath !== workspaceRoot &&
      !targetPath.startsWith(workspacePrefix)
    ) {
      throw new Error('Target file path is outside user.workspace')
    }

    const content =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, content, 'utf-8')
    return targetPath
  }

  // ── Token usage ──────────────────────────────────────────────────────────

  insertTokenUsage(record: StoredTokenUsageRecord): void {
    this.tokenUsage.insert(record)
  }

  listTokenUsageChartSeries(args: {
    userId: string
    since?: string
    until?: string
    bucketMinutes?: number
  }): TokenUsageChartSeries[] {
    return this.tokenUsage.listChartSeries(args)
  }

  getTokenUsageDashboard(args: {
    userId: string
    since?: string
    until?: string
  }): TokenUsageDashboard {
    return this.tokenUsage.getDashboard(args)
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  close(): void {
    this.db.close()
  }
}
