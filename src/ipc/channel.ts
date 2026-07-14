import type { ProviderType } from '@shared/agent/llm-provider-registry'

export interface IpcMainEventListener<Send = void, Receive = void> {
  ipcMainHandle: Send extends void
    ? (event: Electron.IpcMainInvokeEvent) => Receive | Promise<Receive>
    : (
        event: Electron.IpcMainInvokeEvent,
        args: Send,
      ) => Receive | Promise<Receive>
  ipcRendererInvoke: Send extends void
    ? () => Promise<Receive>
    : (args: Send) => Promise<Receive>
}

export interface IpcRendererEventListener<Send = void> {
  ipcRendererOn: Send extends void
    ? (event: Electron.IpcRendererEvent) => void
    : (event: Electron.IpcRendererEvent, args: Send) => void
  webContentSend: Send extends void
    ? (webContents: Electron.WebContents) => void
    : (webContents: Electron.WebContents, args: Send) => void
}

export class IpcChannelMainClass {
  GetSystemConfig: IpcMainEventListener<
    { key: string; defaultValue?: string },
    string
  > = null!
  GetSystemConfigs: IpcMainEventListener<
    { keys?: string[] },
    Record<string, string>
  > = null!
  SetSystemConfig: IpcMainEventListener<
    { key: string; value: string | number | boolean },
    boolean
  > = null!
  IsUseSysTitle: IpcMainEventListener<void, boolean> = null!
  SetAppWindowAppearance: IpcMainEventListener<
    { appearance: 'solid' | 'glass' },
    void
  > = null!
  /**
   * Exit application
   */
  AppClose: IpcMainEventListener = null!
  CheckUpdate: IpcMainEventListener<
    void,
    import('@shared/app-update').AppUpdateMessage | null
  > = null!
  ConfirmUpdate: IpcMainEventListener = null!
  DownloadUpdate: IpcMainEventListener = null!
  GetAppVersion: IpcMainEventListener<
    void,
    { version: string; isPackaged: boolean }
  > = null!
  GetSupportConfig: IpcMainEventListener<
    void,
    import('@shared/support-bundle').SupportConfig
  > = null!
  ReportClientError: IpcMainEventListener<
    import('@shared/support-bundle').SupportClientErrorPayload,
    void
  > = null!
  SubmitSupportReport: IpcMainEventListener<
    import('@shared/support-bundle').SupportReportOptions,
    import('@shared/support-bundle').SupportReportResult
  > = null!
  OpenMessagebox: IpcMainEventListener<
    Electron.MessageBoxOptions,
    Electron.MessageBoxReturnValue
  > = null!
  StartDownload: IpcMainEventListener<string> = null!
  OpenErrorbox: IpcMainEventListener<{ title: string; message: string }> = null!
  StartServer: IpcMainEventListener<void, string> = null!
  StopServer: IpcMainEventListener<void, string> = null!
  HotUpdate: IpcMainEventListener = null!
  /**
   * Load all skills from the skills directory and return them as Agent objects
   */
  LoadSkills: IpcMainEventListener<
    void,
    Array<{
      id: string
      name: string
      description: string
      model: string
      systemPrompt: string
      color: string
      enabled: boolean
      provider: string
      isSkill: true
      skillId: string
      skillsPrompt?: string
      constraints?: Array<{
        expression: string
        message: string
        severity: string
      }>
      toolLoop?: {
        tools: Array<{
          name: string
          tags?: string[]
          description: string
          inputSchema?: unknown
          os?: 'mac' | 'linux' | 'win'
          needsApproval?: boolean
        }>
        maxIterations?: number
      }
      guardrails?: Array<{ rule: string; action: string; message?: string }>
    }>
  > = null!
  ListWorkflowPanelSkills: IpcMainEventListener<
    void,
    import('@main/workflows/workflow-skills').WorkflowPanelSkillInfo[]
  > = null!
  /**
   * List persisted agent configurations for a user
   */
  ListAgentConfigurations: IpcMainEventListener<
    { userId: string },
    Array<{
      agentId: string
      userId: string
      name: string
      description: string
      model: string
      provider: ProviderType
      color:
        | 'primary'
        | 'secondary'
        | 'success'
        | 'info'
        | 'warning'
        | 'error'
        | 'neutral'
      enabled: boolean
      systemPrompt: string
      skillsPrompt: string
      availableSet: string[]
      availableSetTouched: boolean
      toolNeedsApprovalOverrides: Record<string, boolean>
      availableMcpServers: string[] | null
      toolLoopMaxIterations: number
      todoMaxRetries: number
      allowAsSubAgent: boolean
      allowSubAgents: boolean
      subAgentIds: string[] | null
      llmRoutingMode: 'unified' | 'per_stage'
      stageLlm: Partial<
        Record<
          'explore' | 'toolLoop' | 'verifier',
          { provider: ProviderType; model: string }
        >
      >
      createdAt: string
      updatedAt: string
    }>
  > = null!
  /**
   * Persist a full editable agent configuration (upsert)
   */
  UpsertAgentConfiguration: IpcMainEventListener<{
    agentId: string
    userId: string
    name: string
    description: string
    model: string
    provider: ProviderType
    color:
      | 'primary'
      | 'secondary'
      | 'success'
      | 'info'
      | 'warning'
      | 'error'
      | 'neutral'
    enabled: boolean
    systemPrompt: string
    skillsPrompt: string
    availableSet: string[]
    availableSetTouched: boolean
    toolNeedsApprovalOverrides: Record<string, boolean>
    availableMcpServers: string[] | null
    toolLoopMaxIterations: number
    todoMaxRetries: number
    allowAsSubAgent: boolean
    allowSubAgents: boolean
    subAgentIds: string[] | null
    llmRoutingMode: 'unified' | 'per_stage'
    stageLlm: Partial<
      Record<
        'explore' | 'toolLoop' | 'verifier',
        { provider: ProviderType; model: string }
      >
    >
  }> = null!
  /**
   * Delete a persisted agent configuration
   */
  DeleteAgentConfiguration: IpcMainEventListener<{
    agentId: string
    userId: string
  }> = null!
  /**
   * List all tools available in the shared toolSet (toolSet/index.ts)
   */
  ListToolSetTools: IpcMainEventListener<
    void,
    Array<{
      name: string
      tags: string[]
      description: string
      needsApproval?: boolean
      os?: 'mac' | 'linux' | 'win'
      params: Array<{
        name: string
        type: string
        required: boolean
        description?: string
        default?: string
      }>
    }>
  > = null!
  /**
   * Execute a single tool from a skill action folder.
   */
  CallSkillTool: IpcMainEventListener<
    { skillId: string; toolName: string; input: unknown },
    unknown
  > = null!
  /**
   * Return the resolved path to the skills directory
   */
  GetSkillsDir: IpcMainEventListener<void, string> = null!
  /**
   * List read-only skill attachments (refs, scripts, forms) for settings UI.
   */
  ListSkillAttachments: IpcMainEventListener<
    { skillId: string },
    Array<{
      category: 'ref' | 'script' | 'form'
      relativePath: string
      fileName: string
      source: 'bundled' | 'user'
      sizeBytes: number
    }>
  > = null!
  /**
   * Read a skill attachment for download (utf8 text or base64 binary).
   */
  ReadSkillAttachment: IpcMainEventListener<
    { skillId: string; relativePath: string },
    { content: string; encoding: 'utf8' | 'base64'; mimeType: string }
  > = null!
  /**
   * Read skill compilation status and structured artifact for settings review.
   */
  GetSkillCompilation: IpcMainEventListener<
    { skillId: string },
    {
      status: 'pending' | 'ready' | 'failed' | 'missing'
      source: 'bundled' | 'user' | null
      compiled:
        | import('@main/skills/skill-compiled-schema').SkillCompiledArtifact
        | null
      errorMessage: string | null
      fingerprint: string
      compiledAt: string | null
    }
  > = null!
  /**
   * Compile skill sources into the structured artifact (manual; not run on app load).
   * When `force` is false, skips LLM if DB row matches current source fingerprint.
   */
  CompileSkill: IpcMainEventListener<
    { skillId: string; force?: boolean },
    {
      status: 'pending' | 'ready' | 'failed' | 'missing'
      compiled:
        | import('@main/skills/skill-compiled-schema').SkillCompiledArtifact
        | null
      errorMessage: string | null
      fingerprint: string
      compiledAt: string | null
    }
  > = null!
  /** List all loadable skills with compilation status (settings Skills tab). */
  ListSkillCompilations: IpcMainEventListener<
    void,
    Array<{
      skillId: string
      name: string
      status: 'pending' | 'ready' | 'failed' | 'missing'
      source: 'bundled' | 'user' | null
      diskFingerprint: string
      storedFingerprint: string
      stale: boolean
      compiledAt: string | null
      errorMessage: string | null
      skillProvider: import('@main/skills/types').SkillProvider
      skillModel: string
      compileProvider: import('@main/skills/types').SkillProvider
      compileModel: string
      compileLlmSource: 'skill_properties' | 'per_skill'
    }>
  > = null!
  /** Compile every loadable skill (manual bulk action). */
  CompileAllSkills: IpcMainEventListener<
    { force?: boolean },
    Array<{
      skillId: string
      status: 'pending' | 'ready' | 'failed' | 'missing'
      errorMessage: string | null
    }>
  > = null!
  /** Force recompile skill sources (same as CompileSkill with force: true). */
  RecompileSkill: IpcMainEventListener<
    { skillId: string },
    {
      status: 'pending' | 'ready' | 'failed' | 'missing'
      compiled:
        | import('@main/skills/skill-compiled-schema').SkillCompiledArtifact
        | null
      errorMessage: string | null
      fingerprint: string
      compiledAt: string | null
    }
  > = null!
  /** Save user-edited compiled artifact without re-running compile LLM. */
  SaveSkillCompilation: IpcMainEventListener<
    {
      skillId: string
      compiled: import('@main/skills/skill-compiled-schema').SkillCompiledArtifact
    },
    {
      ok: boolean
      compiled:
        | import('@main/skills/skill-compiled-schema').SkillCompiledArtifact
        | null
      errorMessage: string | null
      fingerprint: string
      compiledAt: string | null
    }
  > = null!
  /**
   * Small screenshot / thumbnail for a sandbox output file (image, HTML, PDF).
   */
  GetStepOutputLinkPreview: IpcMainEventListener<
    { fileUrl: string },
    { dataUrl: string; kind: 'image' | 'html' | 'pdf' } | null
  > = null!
  /**
   * Dry-run preview for file edit/write/patch tools (no writes).
   */
  PreviewFileChange: IpcMainEventListener<
    { toolName: string; input: Record<string, unknown> },
    import('@shared/file-change/types').FileChangePreviewResult
  > = null!
  /** Dry-run preview for exit_plan_mode approval (plan markdown + todos). */
  PreviewPlanApproval: IpcMainEventListener<
    { conversationId: string; agentSummary?: string },
    import('@shared/agent/plan-approval-preview').PlanApprovalPreviewResult
  > = null!
  /**
   * List all conversations for a given agent, ordered by most recent
   */
  ListConversations: IpcMainEventListener<
    { agentId: string },
    Array<{
      id: string
      agentId: string
      title: string
      createdAt: string
      updatedAt: string
    }>
  > = null!
  /**
   * Create a new conversation record
   */
  CreateConversation: IpcMainEventListener<
    { id: string; agentId: string; title: string; createdAt: string },
    {
      id: string
      agentId: string
      title: string
      createdAt: string
      updatedAt: string
    }
  > = null!
  /**
   * Update the title of an existing conversation
   */
  UpdateConversationTitle: IpcMainEventListener<{
    conversationId: string
    title: string
  }> = null!
  /**
   * Update which agent/skill owns a conversation (persisted per conversation).
   */
  UpdateConversationAgent: IpcMainEventListener<{
    conversationId: string
    agentId: string
  }> = null!
  /**
   * Load conversation metadata (agent binding, title, timestamps).
   */
  GetConversationMeta: IpcMainEventListener<
    { conversationId: string },
    {
      id: string
      agentId: string
      title: string
      createdAt: string
      updatedAt: string
    } | null
  > = null!
  /**
   * Delete a conversation and all its messages
   */
  DeleteConversation: IpcMainEventListener<{ conversationId: string }> = null!
  /**
   * Clear chat history only — keeps conversation, workspace, and agent binding.
   */
  ClearConversationHistory: IpcMainEventListener<{ conversationId: string }> =
    null
  /**
   * Persisted sandbox runs for a conversation (report panel + cleanup).
   */
  GetConversationSandboxRuns: IpcMainEventListener<
    { conversationId: string },
    Array<{
      sandboxRoot: string
      conversationId: string
      resultsFileUrl: string
      outputResultsDir: string
      createdAt: string
    }>
  > = null!
  /**
   * Load all persisted messages for a given conversation
   */
  GetConversation: IpcMainEventListener<
    { conversationId: string },
    Array<{
      id: string
      conversationId: string
      agentId: string
      role: 'user' | 'assistant'
      content: string
      createdAt: string
    }>
  > = null!
  /**
   * Paginated message history (latest page or older rows before a timestamp).
   */
  GetConversationMessagesPage: IpcMainEventListener<
    { conversationId: string; before?: string; limit?: number },
    {
      messages: Array<{
        id: string
        conversationId: string
        agentId: string
        role: 'user' | 'assistant'
        content: string
        createdAt: string
      }>
      hasOlder: boolean
    }
  > = null!
  /**
   * Persist a single message
   */
  SaveMessage: IpcMainEventListener<{
    id: string
    conversationId: string
    agentId: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }> = null!
  /**
   * LLM token usage dashboard: overview stats and daily model breakdown.
   */
  ListTokenUsageChart: IpcMainEventListener<
    {
      userId?: string
      since?: string
      until?: string
    },
    {
      overview: {
        sessions: number
        messages: number
        totalTokens: number
        activeDays: number
      }
      models: Array<{
        seriesKey: string
        provider: string | null
        model: string | null
        label: string
        totalTokens: number
      }>
      dailyBars: Array<{
        date: string
        totalTokens: number
        segments: Array<{
          seriesKey: string
          totalTokens: number
        }>
      }>
    }
  > = null!
  /**
   * Update an existing message's content
   */
  UpdateMessage: IpcMainEventListener<{
    id: string
    content: string
  }> = null!
  /**
   * Get all user property key-value pairs for a user
   */
  GetUserProperties: IpcMainEventListener<
    { userId: string },
    Record<string, string>
  > = null!
  /**
   * Get all user properties with metadata for a user
   */
  ListUserProperties: IpcMainEventListener<
    { userId: string },
    Array<{
      userId: string
      propertyKey: string
      propertyValue: string
      updatedAt: string
    }>
  > = null!
  /**
   * Get a single user property by key
   */
  GetUserProperty: IpcMainEventListener<
    { userId: string; propertyKey: string },
    {
      userId: string
      propertyKey: string
      propertyValue: string
      updatedAt: string
    } | null
  > = null!
  /**
   * Set a user property key-value pair (upsert)
   */
  SetUserProperty: IpcMainEventListener<{
    userId: string
    propertyKey: string
    propertyValue: string
  }> = null!
  /**
   * Delete a single user property by key
   */
  DeleteUserProperty: IpcMainEventListener<{
    userId: string
    propertyKey: string
  }> = null!
  /**
   * Delete all user properties for a user
   */
  ClearUserProperties: IpcMainEventListener<{ userId: string }> = null!
  /**
   * List all stored MCP servers for a user
   */
  ListMcpServers: IpcMainEventListener<
    { userId: string },
    Array<{
      id: string
      userId: string
      name: string
      transportType: 'http' | 'sse' | 'stdio'
      url: string
      command: string
      args: string[]
      env: Record<string, string>
      headers: Record<string, string>
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>
  > = null!
  /**
   * Create a new MCP server definition
   */
  CreateMcpServer: IpcMainEventListener<
    {
      id: string
      userId: string
      name: string
      transportType: 'http' | 'sse' | 'stdio'
      url?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      headers?: Record<string, string>
      enabled?: boolean
    },
    {
      id: string
      userId: string
      name: string
      transportType: 'http' | 'sse' | 'stdio'
      url: string
      command: string
      args: string[]
      env: Record<string, string>
      headers: Record<string, string>
      enabled: boolean
      createdAt: string
      updatedAt: string
    }
  > = null!
  /**
   * Enable or disable an MCP server
   */
  SetMcpServerEnabled: IpcMainEventListener<{
    userId: string
    serverId: string
    enabled: boolean
  }> = null!
  /**
   * Delete an MCP server definition
   */
  DeleteMcpServer: IpcMainEventListener<{ userId: string; serverId: string }> =
    null
  /**
   * Discover tools exposed by a specific MCP server
   */
  GetMcpServerTools: IpcMainEventListener<
    { userId: string; serverId: string },
    Array<{
      name: string
      description: string
      inputSchema?: unknown
    }>
  > = null!
  /**
   * Whether npx / uvx are available for stdio MCP servers
   */
  GetMcpRuntimeStatus: IpcMainEventListener<
    void,
    import('@main/services/mcp-runtime-check').McpRuntimeStatus
  > = null!
  /**
   * Execute one tool call on a specific MCP server
   */
  CallMcpServerTool: IpcMainEventListener<
    { userId: string; serverId: string; toolName: string; input: unknown },
    unknown
  > = null!
  /**
   * Search the official MCP Registry for installable servers
   */
  SearchMcpRegistry: IpcMainEventListener<
    { search?: string; cursor?: string; limit?: number },
    import('@shared/mcp/registry-types').McpRegistrySearchResult
  > = null!
  /**
   * Load configuration drafts for a registry server
   */
  GetMcpRegistryServer: IpcMainEventListener<
    {
      serverName: string
      version?: string
      preferredTransport?: 'http' | 'sse' | 'stdio'
    },
    {
      summary: import('@shared/mcp/registry-types').McpRegistryServerSummary
      drafts: import('@shared/mcp/registry-types').McpRegistryServerDraft[]
      preferredDraft:
        | import('@shared/mcp/registry-types').McpRegistryServerDraft
        | null
    }
  > = null!
  /**
   * Save arbitrary data to a file under user.workspace
   */
  SaveDataToFile: IpcMainEventListener<
    { userId: string; relativePath: string; data: unknown },
    { filePath: string }
  > = null!
  /**
   * List persisted scheduler definitions
   */
  ListSchedulers: IpcMainEventListener<
    { userId: string },
    Array<{
      id: string
      userId: string
      name: string
      enabled: boolean
      scheduleType: 'interval' | 'cron'
      intervalMs: number | null
      cronExpression: string | null
      timezone: string | null
      actionType: 'send-channel-message' | 'run-agent'
      channelId: string
      target: string
      message: string
      agentId: string
      conversationId: string
      prompt: string
      lastRunAt: string | null
      createdAt: string
      updatedAt: string
    }>
  > = null!
  /**
   * Create or update one scheduler definition
   */
  UpsertScheduler: IpcMainEventListener<{
    id: string
    userId: string
    name: string
    enabled: boolean
    scheduleType: 'interval' | 'cron'
    intervalMs: number | null
    cronExpression: string | null
    timezone: string | null
    actionType: 'send-channel-message' | 'run-agent'
    channelId: string
    target: string
    message: string
    agentId: string
    conversationId: string
    prompt: string
    workflowId: string
  }> = null!
  /**
   * Delete one scheduler definition
   */
  DeleteScheduler: IpcMainEventListener<{
    userId: string
    schedulerId: string
  }> = null!
  ListWorkflows: IpcMainEventListener<
    { userId: string },
    Array<{
      id: string
      userId: string
      name: string
      description: string
      status: string
      currentVersionId: string | null
      createdAt: string
      updatedAt: string
    }>
  > = null!
  GetWorkflowSnapshot: IpcMainEventListener<
    { workflowId: string },
    {
      workflow: {
        id: string
        userId: string
        name: string
        description: string
        status: string
        currentVersionId: string | null
        createdAt: string
        updatedAt: string
      }
      versions: Array<{
        id: string
        workflowId: string
        versionNumber: number
        definitionJson: string
        mermaid: string
        summaryMarkdown: string
        compilerMetadataJson: string
        createdAt: string
      }>
      deployments: Array<{
        id: string
        workflowId: string
        versionId: string
        userId: string
        target: string
        enabled: boolean
        configJson: string
        lastRunAt: string | null
        lastError: string | null
        createdAt: string
        updatedAt: string
      }>
      sourceFiles: {
        workflowDefinitionJson: string
        entitiesDefinitionJson: string
      }
    } | null
  > = null!
  CompileWorkflow: IpcMainEventListener<
    {
      userId: string
      workflowId: string
      prompt?: string
      uploadMarkdown?: string
      uploadPath?: string
      baseVersionId?: string
    },
    import('@main/workflows/workflow-compiler').WorkflowCompileResponse
  > = null!
  RunWorkflowCompilerAgent: IpcMainEventListener<
    {
      conversationId: string
      workflowId: string
      assistantMessageId: string
      userId: string
      uiMessages?: unknown[]
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
      baseVersionId?: string
      compileHints?: import('@shared/workflows/workflow-studio').WorkflowCompileHints
    },
    import('@shared/workflows/workflow-studio').RunWorkflowCompilerAgentIpcResult
  > = null!
  ConfirmWorkflowVersion: IpcMainEventListener<
    { userId: string; workflowId: string; versionId: string },
    { ok: true; definitionJson: string }
  > = null!
  SaveWorkflowDefinitionJson: IpcMainEventListener<
    {
      userId: string
      workflowId: string
      definitionJson: string
      baseVersionId?: string
    },
    import('@main/workflows/workflow-compiler').SaveWorkflowDefinitionResponse
  > = null!
  RunWorkflowTest: IpcMainEventListener<
    { workflowId: string; versionId: string; inputs?: Record<string, unknown> },
    import('@shared/workflows/deployment-target').WorkflowTestReport
  > = null!
  DeployWorkflow: IpcMainEventListener<
    {
      workflowId: string
      versionId: string
      target?: 'local' | 'agent-server'
      enabled?: boolean
      workspacePath?: string | null
    },
    import('@shared/workflows/deployment-target').DeployHandle
  > = null!
  UndeployWorkflow: IpcMainEventListener<
    { deploymentId: string },
    { ok: true }
  > = null!
  RunWorkflowManual: IpcMainEventListener<
    {
      workflowId: string
      versionId?: string
      inputs?: Record<string, unknown>
    },
    import('@main/workflows/workflow-executor').WorkflowExecuteResult
  > = null!
  DeleteWorkflow: IpcMainEventListener<
    { userId: string; workflowId: string },
    { ok: true }
  > = null!
  CreateWorkflowDraft: IpcMainEventListener<
    { userId: string; name: string; description?: string },
    { workflowId: string }
  > = null!
  /**
   * Window ready
   */
  WinReady: IpcMainEventListener = null!
  /**
   *
   * Open window
   */
  OpenWin: IpcMainEventListener<{
    /**
     * New window URL
     *
     * @type {string}
     */
    url: string

    /**
     * Whether this is a payment page
     *
     * @type {boolean}
     */
    IsPay?: boolean

    /**
     * Payment parameters
     *
     * @type {string}
     */
    PayUrl?: string

    /**
     * Data sent to new page
     *
     * @type {unknown}
     */
    sendData?: unknown
  }> = null!
  /**
   * Start Google OAuth2 sign-in flow, returns the authenticated account info
   */
  GoogleSignIn: IpcMainEventListener<
    void,
    {
      email: string
      name: string
      picture: string
    }
  > = null!
  /**
   * Sign out and clear stored Teralexi Google account tokens
   */
  GoogleSignOut: IpcMainEventListener<void, void> = null!
  /**
   * Return the currently stored Teralexi Google account info, or null if not signed in
   */
  GetGoogleAccount: IpcMainEventListener<
    void,
    {
      email: string
      name: string
      picture: string
    } | null
  > = null!
  /**
   * Return verified subscription entitlement snapshot for the signed-in user.
   */
  GetEntitlement: IpcMainEventListener<
    void,
    import('@shared/subscription/entitlement-types').EntitlementUiSnapshot | null
  > = null!
  /**
   * Refresh auth + entitlement from the server and return the latest snapshot.
   */
  RefreshEntitlement: IpcMainEventListener<
    void,
    import('@shared/subscription/entitlement-types').EntitlementUiSnapshot | null
  > = null!
  /**
   * Start Google Workspace OAuth2 sign-in flow (Gmail, Calendar, Drive)
   */
  GoogleWorkspaceSignIn: IpcMainEventListener<
    void,
    {
      email: string
      name: string
      picture: string
      workspaceAccess: boolean
    }
  > = null!
  GoogleWorkspaceSignOut: IpcMainEventListener<void, void> = null!
  GetGoogleWorkspaceAccount: IpcMainEventListener<
    void,
    {
      email: string
      name: string
      picture: string
      workspaceAccess: boolean
    } | null
  > = null!
  /**
   * Start GitHub OAuth2 sign-in flow, returns the authenticated account info
   */
  GitHubSignIn: IpcMainEventListener<
    void,
    {
      login: string
      name: string
      email: string
      avatarUrl: string
      skillAccess: boolean
      missingScopes: string[]
    }
  > = null!
  /**
   * Sign out and clear stored GitHub account tokens
   */
  GitHubSignOut: IpcMainEventListener<void, void> = null!
  /**
   * Return the currently stored GitHub account info, or null if not signed in
   */
  GetGitHubAccount: IpcMainEventListener<
    void,
    {
      login: string
      name: string
      email: string
      avatarUrl: string
      skillAccess: boolean
      missingScopes: string[]
    } | null
  > = null!
  /**
   * Return current WhatsApp integration state
   */
  GetWhatsAppState: IpcMainEventListener<
    void,
    {
      botName: string
      targetPhone: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      qrCodeDataUrl: string | null
      lastError: string | null
    }
  > = null!
  /**
   * Save the WhatsApp bot display name
   */
  SetWhatsAppBotName: IpcMainEventListener<
    { botName: string },
    {
      botName: string
      targetPhone: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      qrCodeDataUrl: string | null
      lastError: string | null
    }
  > = null!
  /**
   * Save the WhatsApp target phone number used by mini chat
   */
  SetWhatsAppTargetPhone: IpcMainEventListener<
    { targetPhone: string },
    {
      botName: string
      targetPhone: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      qrCodeDataUrl: string | null
      lastError: string | null
    }
  > = null!
  /**
   * Refresh WhatsApp QR code by restarting the socket session
   */
  RefreshWhatsAppQrCode: IpcMainEventListener<
    void,
    {
      botName: string
      targetPhone: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      qrCodeDataUrl: string | null
      lastError: string | null
    }
  > = null!
  /**
   * Log out WhatsApp and clear local auth session
   */
  LogoutWhatsAppSession: IpcMainEventListener<
    void,
    {
      botName: string
      targetPhone: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      qrCodeDataUrl: string | null
      lastError: string | null
    }
  > = null!
  /**
   * Get WhatsApp mini chat messages
   */
  GetWhatsAppChatMessages: IpcMainEventListener<
    void,
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one WhatsApp chat message and return updated messages
   */
  SendWhatsAppChatMessage: IpcMainEventListener<
    { text: string },
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one WhatsApp message to a specific JID and return updated mini chat messages
   */
  SendWhatsAppMessageToJid: IpcMainEventListener<
    { jid: string; text: string },
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Return current Telegram bot integration state
   */
  GetTelegramState: IpcMainEventListener<
    void,
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the Telegram bot display name
   */
  SetTelegramBotName: IpcMainEventListener<
    { botName: string },
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the Telegram bot token and restart the bot
   */
  SetTelegramBotToken: IpcMainEventListener<
    { botToken: string },
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Stop the Telegram bot
   */
  StopTelegramBot: IpcMainEventListener<
    void,
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Get Telegram mini chat messages
   */
  GetTelegramChatMessages: IpcMainEventListener<
    void,
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one Telegram chat message and return updated messages
   */
  SendTelegramChatMessage: IpcMainEventListener<
    { chatId: string; text: string },
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Return current Discord bot integration state
   */
  GetDiscordState: IpcMainEventListener<
    void,
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the Discord bot display name
   */
  SetDiscordBotName: IpcMainEventListener<
    { botName: string },
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the Discord bot token and restart the bot
   */
  SetDiscordBotToken: IpcMainEventListener<
    { botToken: string },
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Stop the Discord bot
   */
  StopDiscordBot: IpcMainEventListener<
    void,
    {
      botName: string
      botToken: string
      botUsername: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Get Discord mini chat messages
   */
  GetDiscordChatMessages: IpcMainEventListener<
    void,
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one Discord chat message and return updated messages
   */
  SendDiscordChatMessage: IpcMainEventListener<
    { channelId: string; text: string },
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Return current WeChat Work bot integration state
   */
  GetWeChatState: IpcMainEventListener<
    void,
    {
      botName: string
      corpId: string
      agentId: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the WeChat bot display name
   */
  SetWeChatBotName: IpcMainEventListener<
    { botName: string },
    {
      botName: string
      corpId: string
      agentId: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save WeChat Work credentials (corpId, corpSecret, agentId) and reconnect
   */
  SetWeChatCredentials: IpcMainEventListener<
    { corpId?: string; corpSecret?: string; agentId?: string },
    {
      botName: string
      corpId: string
      agentId: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Stop the WeChat bot
   */
  StopWeChatBot: IpcMainEventListener<
    void,
    {
      botName: string
      corpId: string
      agentId: string
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Get WeChat mini chat messages
   */
  GetWeChatChatMessages: IpcMainEventListener<
    void,
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one WeChat message to a user and return updated messages
   */
  SendWeChatChatMessage: IpcMainEventListener<
    { userId: string; text: string },
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Handle an incoming WeChat webhook payload
   */
  HandleWeChatWebhook: IpcMainEventListener<
    { fromUser: string; text: string; msgId: string; createTime: number },
    void
  > = null!
  /**
   * Return current Slack bot integration state
   */
  GetSlackState: IpcMainEventListener<
    void,
    {
      botName: string
      botToken: string
      appToken: string
      botUserId: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the Slack bot display name
   */
  SetSlackBotName: IpcMainEventListener<
    { botName: string },
    {
      botName: string
      botToken: string
      appToken: string
      botUserId: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Save the Slack bot tokens and restart the bot
   */
  SetSlackTokens: IpcMainEventListener<
    { botToken?: string; appToken?: string },
    {
      botName: string
      botToken: string
      appToken: string
      botUserId: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Stop the Slack bot
   */
  StopSlackBot: IpcMainEventListener<
    void,
    {
      botName: string
      botToken: string
      appToken: string
      botUserId: string | null
      status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
      lastError: string | null
    }
  > = null!
  /**
   * Get Slack mini chat messages
   */
  GetSlackChatMessages: IpcMainEventListener<
    void,
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one Slack chat message and return updated messages
   */
  SendSlackChatMessage: IpcMainEventListener<
    { channelId: string; text: string },
    Array<{
      id: string
      text: string
      fromMe: boolean
      timestamp: number
    }>
  > = null!
  /**
   * Send one message through any registered channel target
   */
  SendChannelMessage: IpcMainEventListener<
    { channelId: string; target: string; text: string },
    boolean
  > = null!
  /**
   * Run the agent engine for a conversation (main process)
   */
  RunAgentForConversation: IpcMainEventListener<
    {
      conversationId: string
      agentId: string
      assistantMessageId: string
      userId: string
      /** Full Chat UI messages when continuing (e.g. tool approval responses) */
      uiMessages?: unknown[]
      /** When `uiMessages` is omitted, persist this user row before loading history */
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
      userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
      /** Local paths to copy into sandbox after the user message is persisted. */
      attachmentSourcePaths?: string[]
    },
    {
      finalContent: string
      hasError: boolean
      errorMessage?: string
      hitlPaused?: boolean
    }
  > = null!
  /**
   * Directly delegate to a catalog sub-agent from an @mention in the composer.
   */
  RunSubAgentMention: IpcMainEventListener<
    {
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
    },
    {
      finalContent: string
      hasError: boolean
      errorMessage?: string
      hitlPaused?: boolean
    }
  > = null!
  /**
   * Stop a running agent for a conversation
   */
  StopAgentForConversation: IpcMainEventListener<
    { conversationId: string },
    void
  > = null!
  /**
   * Pre-warm the in-process cache for a user+agent before the first message.
   * Called by the renderer when the user switches to an agent or opens the chat panel.
   * Fire-and-forget; the handler never throws.
   */
  WarmAgentCache: IpcMainEventListener<
    { userId: string; agentId?: string },
    void
  > = null!
  /**
   * Open a file (absolute path or file:// URL) in the OS default application.
   * Returns success=false with an error message when the OS rejects the path.
   */
  OpenFileInDefaultApp: IpcMainEventListener<
    { path: string },
    { success: boolean; error?: string }
  > = null!
  /**
   * Show a Save-As dialog and copy a sandbox file to the user-chosen location.
   * Returns the saved path, or null when the user cancels.
   */
  SaveFileAs: IpcMainEventListener<
    { sourcePath: string; defaultName: string },
    { savedPath: string | null }
  > = null!
  /**
   * Render markdown to PDF and save via a native Save-As dialog.
   * Returns the saved path, or null when the user cancels.
   */
  ExportMarkdownAsPdf: IpcMainEventListener<
    {
      markdown: string
      defaultFileName: string
      kind?: 'default' | 'research-report'
    },
    { savedPath: string | null; error?: string }
  > = null!
  /**
   * Position the sandbox results WebContentsView over the given screen rect (or hide).
   */
  SyncSandboxOutputView: IpcMainEventListener<
    {
      screenBounds: { x: number; y: number; width: number; height: number }
      fileUrl: string | null
      markdownView?: 'html' | 'raw'
    },
    void
  > = null!
  /**
   * Delete on-disk sandbox directories (validated under `~/.teralexi/workspace/sandbox/` or legacy tmpdir).
   */
  RemoveSandboxDirectories: IpcMainEventListener<{ paths: string[] }, void> =
    null
  /**
   * Open a native folder-picker dialog and return the chosen path (or null on cancel).
   */
  SelectWorkspaceFolder: IpcMainEventListener<void, { path: string | null }> =
    null
  /** Per-conversation workspace (session) settings. */
  GetConversationWorkspace: IpcMainEventListener<
    { conversationId: string },
    {
      stack: Array<{ type: 'sandbox' } | { type: 'workspace'; path: string }>
      workspacePath: string | null
    }
  > = null!
  SetConversationWorkspace: IpcMainEventListener<
    { conversationId: string; path: string },
    {
      ok: boolean
      stack?: Array<{ type: 'sandbox' } | { type: 'workspace'; path: string }>
      workspacePath?: string | null
      error?: string
    }
  > = null!
  ClearConversationWorkspace: IpcMainEventListener<
    { conversationId: string },
    {
      ok: boolean
      stack?: Array<{ type: 'sandbox' } | { type: 'workspace'; path: string }>
      workspacePath?: string | null
      error?: string
    }
  > = null!

  // ── Workspace git operations (UI → main process, no agent required) ─────────

  /** git status for the conversation workspace (path resolved in main). */
  GetWorkspaceGitStatus: IpcMainEventListener<
    { conversationId: string },
    {
      ok: boolean
      branch: string
      upstream: string | null
      ahead: number
      behind: number
      entries: Array<{
        code: string
        index: string
        worktree: string
        path: string
        origPath?: string
      }>
      clean: boolean
      error?: string
    }
  > = null!
  /** git diff (unstaged or staged) for the workspace. */
  GetWorkspaceGitDiff: IpcMainEventListener<
    { conversationId: string; staged?: boolean; files?: string[] },
    { ok: boolean; diff: string; error?: string }
  > = null!
  /** git log for the workspace. */
  GetWorkspaceGitLog: IpcMainEventListener<
    { conversationId: string; limit?: number },
    {
      ok: boolean
      commits: Array<{
        hash: string
        shortHash: string
        subject: string
        author: string
        date: string
        refs: string
      }>
      error?: string
    }
  > = null!
  /** git add files (or all) in the workspace. */
  RunWorkspaceGitAdd: IpcMainEventListener<
    { conversationId: string; files?: string[] },
    { ok: boolean; output?: string; error?: string }
  > = null!
  /** git commit staged changes in the workspace. */
  RunWorkspaceGitCommit: IpcMainEventListener<
    { conversationId: string; message: string },
    { ok: boolean; hash?: string; output?: string; error?: string }
  > = null!
  /** git push the current branch to remote. */
  RunWorkspaceGitPush: IpcMainEventListener<
    {
      conversationId: string
      remote?: string
      branch?: string
      setUpstream?: boolean
    },
    { ok: boolean; output?: string; error?: string }
  > = null!
  /** Create a GitHub PR via `gh pr create`. */
  RunWorkspaceGitCreatePR: IpcMainEventListener<
    {
      conversationId: string
      title: string
      body: string
      base?: string
      draft?: boolean
    },
    { ok: boolean; url?: string; output?: string; error?: string }
  > = null!
  /** List immediate children under a workspace path (filesystem + git status badges). */
  ListWorkspaceFiles: IpcMainEventListener<
    { conversationId: string; relativePath?: string },
    {
      ok: boolean
      entries: Array<{
        path: string
        name: string
        isDir: boolean
        gitStatus?: string
      }>
      error?: string
    }
  > = null!
  /** Start (or restart) filesystem watch for workspace/sandbox files. */
  WatchWorkspaceFiles: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; error?: string }
  > = null!
  /** Stop filesystem watch for a conversation. */
  UnwatchWorkspaceFiles: IpcMainEventListener<
    { conversationId: string },
    void
  > = null!
  /** Fuzzy file search for composer `@file` mentions. */
  SearchWorkspaceFiles: IpcMainEventListener<
    { conversationId: string; query?: string; limit?: number },
    { ok: boolean; paths: string[]; error?: string }
  > = null!
  /** Pick local files to attach in the chat composer (staging only). */
  PickChatAttachments: IpcMainEventListener<
    void,
    { ok: boolean; paths: string[]; error?: string }
  > = null!
  /** Copy picked files into the conversation sandbox and persist metadata. */
  IngestChatAttachments: IpcMainEventListener<
    {
      conversationId: string
      messageId: string
      sourcePaths: string[]
    },
    {
      ok: boolean
      attachments: import('@shared/chat/attachments').ChatAttachmentMeta[]
      error?: string
    }
  > = null!
  /** List chat attachments for a conversation. */
  GetConversationAttachments: IpcMainEventListener<
    { conversationId: string },
    {
      ok: boolean
      attachments: import('@shared/chat/attachments').ChatAttachmentMeta[]
      error?: string
    }
  > = null!
  /** Search uploaded chat attachments for `@file` mentions. */
  SearchChatAttachments: IpcMainEventListener<
    { conversationId: string; query?: string; limit?: number },
    { ok: boolean; paths: string[]; error?: string }
  > = null!
  /** Reveal an uploaded chat attachment in the system file manager. */
  RevealChatAttachment: IpcMainEventListener<
    { conversationId: string; sandboxPath: string },
    { ok: boolean; error?: string }
  > = null!
  /** Open a workspace file in the OS default application. */
  OpenWorkspaceFile: IpcMainEventListener<
    { conversationId: string; relativePath: string },
    { ok: boolean; error?: string }
  > = null!
  /** Read workspace file text for the in-app editor. */
  ReadWorkspaceFile: IpcMainEventListener<
    { conversationId: string; relativePath: string },
    {
      ok: boolean
      content?: string
      size?: number
      fileUrl?: string
      error?: string
      binary?: boolean
    }
  > = null!
  /** Write workspace file text from the in-app editor. */
  WriteWorkspaceFile: IpcMainEventListener<
    { conversationId: string; relativePath: string; content: string },
    { ok: boolean; error?: string }
  > = null!
  /** Run a shell command in the workspace files panel context. */
  RunWorkspaceTerminalCommand: IpcMainEventListener<
    { conversationId: string; command: string; relativeCwd?: string },
    {
      ok: boolean
      cwd?: string
      stdout?: string
      stderr?: string
      exitCode?: number
      error?: string
    }
  > = null!
  /** Interrupt currently running workspace terminal command (Ctrl+C semantics). */
  CancelWorkspaceTerminalCommand: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; error?: string }
  > = null!
  /** Start or restart a persistent PTY session for workspace terminal. */
  StartWorkspaceTerminalSession: IpcMainEventListener<
    {
      conversationId: string
      relativeCwd?: string
      shell?: string | null
      cols?: number
      rows?: number
    },
    { ok: boolean; cwd?: string; shell?: string; error?: string }
  > = null!
  /** Write keyboard input bytes into the persistent PTY session. */
  WriteWorkspaceTerminalInput: IpcMainEventListener<
    { conversationId: string; data: string },
    { ok: boolean; error?: string }
  > = null!
  /** Resize PTY dimensions to match xterm viewport. */
  ResizeWorkspaceTerminalSession: IpcMainEventListener<
    { conversationId: string; cols: number; rows: number },
    { ok: boolean; error?: string }
  > = null!
  /** Stop and dispose persistent PTY session for the conversation. */
  StopWorkspaceTerminalSession: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; error?: string }
  > = null!
  /** Approve a tool type for the rest of the conversation (session-scoped HITL). */
  AddSessionToolApproval: IpcMainEventListener<
    { conversationId: string; toolName: string },
    { ok: boolean; tools: string[] }
  > = null!
  /** Manually compact persisted conversation history (`/compact`). */
  CompactConversation: IpcMainEventListener<
    { conversationId: string; hint?: string; userId?: string },
    { ok: boolean; compacted: boolean; message?: string; error?: string }
  > = null!
  /** Get Kimi-like coding mode for a conversation. */
  GetCodingMode: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; mode: import('@shared/agent/coding-mode').CodingMode }
  > = null!
  /** Set Kimi-like coding mode for a conversation. */
  SetCodingMode: IpcMainEventListener<
    {
      conversationId: string
      mode: import('@shared/agent/coding-mode').CodingMode
    },
    { ok: boolean; mode: import('@shared/agent/coding-mode').CodingMode }
  > = null!
  /** Get per-conversation pre/post turn hooks. */
  GetConversationHooks: IpcMainEventListener<
    { conversationId: string },
    {
      ok: boolean
      hooks: import('@shared/agent/conversation-hooks').ConversationHookEntry[]
    }
  > = null!
  /** Replace per-conversation pre/post turn hooks. */
  SetConversationHooks: IpcMainEventListener<
    {
      conversationId: string
      hooks: import('@shared/agent/conversation-hooks').ConversationHookEntry[]
    },
    {
      ok: boolean
      hooks: import('@shared/agent/conversation-hooks').ConversationHookEntry[]
    }
  > = null!
  /** Read follow-up suggestion chips for a conversation (`followup/meta.json`). */
  GetConversationFollowUps: IpcMainEventListener<
    { conversationId: string },
    {
      ok: boolean
      followUps: import('@shared/agent/follow-up').FollowUpItem[]
      revision: number
    }
  > = null!
  /** Delete follow-up meta for a conversation (clears suggestion chips). */
  ClearConversationFollowUps: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; revision: number }
  > = null!
  /** Skill-owned composer toolbar buttons for the active skill. */
  GetSkillComposerToolbarPlugins: IpcMainEventListener<
    { skillId: string; conversationId: string },
    {
      ok: boolean
      plugins: import('@shared/agent/skill-composer-toolbar').SkillComposerToolbarPluginView[]
    }
  > = null!
  /** Run a skill-owned composer toolbar plugin click handler. */
  InvokeSkillComposerToolbarPlugin: IpcMainEventListener<
    { skillId: string; conversationId: string; pluginId: string },
    import('@shared/agent/skill-composer-toolbar').SkillComposerToolbarInvokeResult
  > = null!
  /** Get high-level planning phase for a conversation. */
  GetPlanModeState: IpcMainEventListener<
    { conversationId: string },
    {
      ok: boolean
      view: import('@shared/agent/plan-mode-phase').PlanModeView
    }
  > = null!
  /** Apply a semantic planning lifecycle transition. */
  TransitionPlanMode: IpcMainEventListener<
    {
      conversationId: string
      action: import('@shared/agent/plan-mode-phase').PlanModeTransition
    },
    {
      ok: boolean
      view: import('@shared/agent/plan-mode-phase').PlanModeView
    }
  > = null!
  /** List background subagent/shell tasks for a conversation. */
  ListBackgroundTasks: IpcMainEventListener<
    { conversationId?: string },
    Array<
      import('@main/agent/background/background-task-manager').BackgroundTask
    >
  > = null!
  /** Cancel a background task by id. */
  CancelBackgroundTask: IpcMainEventListener<
    { taskId: string },
    { ok: boolean }
  > = null!
  /** Install a skill from a GitHub URL into ~/.teralexi/skills. */
  InstallSkillFromGithub: IpcMainEventListener<
    { url: string; skillId?: string },
    { ok: boolean; skillId?: string; error?: string }
  > = null!
  /** Search ClawHub skill registry. */
  SearchClawHubSkills: IpcMainEventListener<
    { query: string; limit?: number },
    import('@shared/skills/clawhub-types').ClawHubSkillSearchResult
  > = null!
  /** Inspect one ClawHub skill (latest version + moderation). */
  GetClawHubSkill: IpcMainEventListener<
    { slug: string },
    import('@shared/skills/clawhub-types').ClawHubSkillDetail
  > = null!
  /** Preview a file from a ClawHub skill package. */
  PreviewClawHubSkillFile: IpcMainEventListener<
    { slug: string; path?: string },
    { content: string }
  > = null!
  /** Install a skill from ClawHub into ~/.teralexi/skills. */
  InstallClawHubSkill: IpcMainEventListener<
    { slug: string; localSkillId?: string; version?: string },
    import('@shared/skills/clawhub-types').ClawHubInstallResult
  > = null!
  /** List skills installed from ClawHub. */
  ListClawHubInstalledSkills: IpcMainEventListener<
    void,
    import('@shared/skills/clawhub-types').ClawHubInstalledSkill[]
  > = null!
  /** Update one ClawHub-installed skill to latest version. */
  UpdateClawHubSkill: IpcMainEventListener<
    { localSkillId: string },
    import('@shared/skills/clawhub-types').ClawHubInstallResult
  > = null!
  /** Update all ClawHub-installed skills (manual; no auto-update). */
  UpdateAllClawHubSkills: IpcMainEventListener<
    void,
    import('@shared/skills/clawhub-types').ClawHubUpdateBatchResult[]
  > = null!
  /** Uninstall a ClawHub-managed skill folder. */
  UninstallClawHubSkill: IpcMainEventListener<
    { localSkillId: string },
    { ok: boolean; error?: string }
  > = null!
  /** Start an editor LSP session for a workspace conversation. */
  EditorLspStartSession: IpcMainEventListener<
    { conversationId: string; workspaceRoot: string },
    { ok: boolean; error?: string }
  > = null!
  /** Stop the editor LSP session and close owned documents. */
  EditorLspStopSession: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; error?: string }
  > = null!
  /** Sync editor buffer to the language server (debounced in main). */
  EditorLspSyncDocument: IpcMainEventListener<
    {
      conversationId: string
      relativePath: string
      content: string
      languageId: string
    },
    { ok: boolean; error?: string }
  > = null!
  /** Close a document in the editor LSP session. */
  EditorLspCloseDocument: IpcMainEventListener<
    { conversationId: string; relativePath: string },
    { ok: boolean; error?: string }
  > = null!
  /** Forward an LSP request for an open editor document. */
  EditorLspRequest: IpcMainEventListener<
    {
      conversationId: string
      relativePath: string
      method: string
      params: unknown
    },
    { ok: boolean; result?: unknown; error?: string }
  > = null!
  /** Format a workspace file with Prettier when available. */
  FormatWorkspaceFile: IpcMainEventListener<
    { conversationId: string; relativePath: string; content: string },
    { ok: boolean; content?: string; error?: string }
  > = null!
  /** Lint a workspace file with ESLint when available. */
  LintWorkspaceFile: IpcMainEventListener<
    { conversationId: string; relativePath: string; content: string },
    {
      ok: boolean
      diagnostics?: Array<{
        line: number
        column: number
        endLine: number
        endColumn: number
        message: string
        severity: 'error' | 'warning'
        ruleId?: string
      }>
      error?: string
    }
  > = null!
  /** Native open-file dialog scoped to the conversation workspace/sandbox. */
  PickWorkspaceEditorFile: IpcMainEventListener<
    { conversationId: string },
    { ok: boolean; relativePath?: string | null; error?: string }
  > = null!
  /** LSP workspace/symbol search for editor go-to-symbol (⌘T). */
  EditorLspWorkspaceSymbols: IpcMainEventListener<
    { conversationId: string; query?: string },
    {
      ok: boolean
      symbols?: import('@shared/editor/workspace-symbol-types').SharedWorkspaceSymbol[]
      error?: string
    }
  > = null!
  /** FIM-based inline AI completion for the workspace editor. */
  EditorAiComplete: IpcMainEventListener<
    {
      conversationId: string
      prefix: string
      suffix: string
      languageId: string
      relativePath: string
    },
    { ok: boolean; completion?: string; error?: string }
  > = null!
}
export class IpcChannelRendererClass {
  // ipcRenderer
  DownloadProgress: IpcRendererEventListener<number> = null!
  DownloadError: IpcRendererEventListener<Boolean> = null!
  DownloadPaused: IpcRendererEventListener<Boolean> = null!
  DownloadDone: IpcRendererEventListener<{
    /**
     * Downloaded file path
     *
     * @type {string}
     */
    filePath: string
  }> = null!
  updateMsg: IpcRendererEventListener<
    import('@shared/app-update').AppUpdateMessage
  > = null!
  UpdateProcessStatus: IpcRendererEventListener<{
    status:
      | 'init'
      | 'downloading'
      | 'moving'
      | 'finished'
      | 'failed'
      | 'download'
    message: string
  }> = null!

  SendDataTest: IpcRendererEventListener<unknown> = null!
  BrowserViewTabDataUpdate: IpcRendererEventListener<{
    bvWebContentsId: number
    title: string
    url: string
    status: 1 | -1 // 1 add/update -1 delete
  }> = null!
  BrowserViewTabPositionXUpdate: IpcRendererEventListener<{
    dragTabOffsetX: number
    positionX: number
    bvWebContentsId: number
  }> = null!
  BrowserTabMouseup: IpcRendererEventListener = null!
  HotUpdateStatus: IpcRendererEventListener<{
    status: string
    message: string
  }> = null!
  ConversationStoreChanged: IpcRendererEventListener<{
    agentId: string
    conversationId: string
  }> = null!
  PlanModeStateChanged: IpcRendererEventListener<{
    conversationId: string
    view: import('@shared/agent/plan-mode-phase').PlanModeView
  }> = null!
  /** Fired when followup/meta.json is written or cleared for a conversation. */
  ConversationFollowUpsChanged: IpcRendererEventListener<{
    conversationId: string
    followUps: import('@shared/agent/follow-up').FollowUpItem[]
    revision: number
  }> = null!
  ChannelIncomingToAgent: IpcRendererEventListener<{
    channelId: string
    senderTarget: string
    conversationId: string
    agentId: string
  }> = null!
  WhatsAppIncomingToAgent: IpcRendererEventListener<{
    agentId: string
    conversationId: string
    senderJid: string
  }> = null!
  /**
   * Streaming chunk from the main-process agent engine
   */
  AgentStreamChunk: IpcRendererEventListener<{
    conversationId: string
    assistantId: string
    chunk: string
  }> = null!
  /** AI SDK UIMessageChunks from tool-loop streams (text-delta, tool-approval-request, …) */
  AgentUIMessageChunk: IpcRendererEventListener<{
    conversationId: string
    assistantId: string
    chunk: Record<string, unknown>
  }> = null!
  AgentStreamFinished: IpcRendererEventListener<{
    conversationId: string
    assistantId: string
  }> = null!
  /**
   * Sandbox run ready — Results panel can load `resultsFileUrl` (directory listing).
   */
  AgentSandboxOutput: IpcRendererEventListener<{
    conversationId: string
    sandboxRoot: string
    outputResultsDir: string
    resultsFileUrl: string
  }> = null!
  /** Main window blocked a file:// navigation — open sandbox preview in Report panel. */
  OpenSandboxPreview: IpcRendererEventListener<{ fileUrl: string }> = null!
  /** Streaming PTY output chunk for workspace terminal xterm view. */
  WorkspaceTerminalData: IpcRendererEventListener<{
    conversationId: string
    data: string
  }> = null!
  /** Session metadata after PTY spawn (cwd/shell). */
  WorkspaceTerminalStarted: IpcRendererEventListener<{
    conversationId: string
    cwd: string
    shell: string
  }> = null!
  /** PTY process exit notification. */
  WorkspaceTerminalExit: IpcRendererEventListener<{
    conversationId: string
    exitCode: number
    signal?: number
  }> = null!
  /** Workspace or sandbox files changed on disk — refresh file browser / git. */
  WorkspaceFilesChanged: IpcRendererEventListener<{
    conversationId: string
  }> = null!
  /** LSP notification pushed from main (diagnostics, etc.). */
  EditorLspNotification: IpcRendererEventListener<{
    conversationId: string
    relativePath: string
    method: string
    params: unknown
  }> = null!
  /** Teralexi Google account linked or cleared (browser OAuth callback). */
  GoogleAccountChanged: IpcRendererEventListener<{
    account: {
      email: string
      name: string
      picture: string
    } | null
  }> = null!
  /** Subscription entitlement verified or cleared. */
  EntitlementChanged: IpcRendererEventListener<{
    entitlement: import('@shared/subscription/entitlement-types').EntitlementUiSnapshot | null
  }> = null!
  /** Google Workspace account linked or cleared. */
  GoogleWorkspaceAccountChanged: IpcRendererEventListener<{
    account: {
      email: string
      name: string
      picture: string
      workspaceAccess: boolean
    } | null
  }> = null!
}
