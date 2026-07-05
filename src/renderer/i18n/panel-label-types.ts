/** User-visible strings inside Settings sub-panels. */
export type SettingsPanelLabels = {
  fields: {
    apiKey: string
    baseUrl: string
    optional: string
    serverUrl: string
    botName: string
    botToken: string
    targetPhone: string
    corpId: string
    corpSecret: string
    agentId: string
    wechatAgentId: string
    appToken: string
    name: string
    description: string
    provider: string
    model: string
    transport: string
    url: string
    command: string
    args: string
    enabled: string
    scheduleType: string
    intervalMs: string
    cronExpression: string
    timezone: string
    action: string
    channelId: string
    target: string
    message: string
    conversationId: string
    prompt: string
    version: string
    tag: string
    type: string
    required: string
  }
  actions: {
    checkConnection: string
    save: string
    delete: string
    send: string
    refresh: string
    connectBot: string
    disconnectBot: string
    signIn: string
    signOut: string
    exportBundle: string
    submitReport: string
    checkForUpdates: string
    downloadUpdate: string
    restartInstall: string
    addServer: string
    deleteServer: string
    addSchedule: string
    saveSchedule: string
    loadAllCompilations: string
    forceRecompileAll: string
    hideToken: string
    showToken: string
  }
  status: {
    connected: string
    connecting: string
    disconnected: string
    idle: string
    error: string
    notChecked: string
    apiKeyConfigured: string
    noApiKey: string
    signedIn: string
    notSignedIn: string
    signingIn: string
    processing: string
    notConfigured: string
    latestVersion: string
    updateFailed: string
    checkingUpdates: string
    updateAvailable: string
    downloading: string
    updateReady: string
  }
  llm: {
    ollamaUnreachable: string
    llamacppUnreachable: string
    llamacppHint: string
    hints: {
      openaiBaseUrl: string
      anthropicBaseUrl: string
      geminiBaseUrl: string
      deepseekBaseUrl: string
      zhipuBaseUrl: string
      llamacppApiKey: string
      openaiCompatibleBaseUrl: string
    }
    llamacppApiUrl: string
  }
  channels: {
    miniChat: string
    noMessagesYet: string
    chatIdPlaceholder: string
    typeMessage: string
    telegramTokenHint: string
    slackAppTokenHint: string
  }
  memory: {
    intro: string
    recording: string
    retention: string
    retentionIntro: string
    requiresBlock: string
    requiresBlockTitle: string
    enableLayer: string
    disableLayer: string
    layers: Record<
      'block' | 'vector' | 'session' | 'persona',
      { title: string; description: string }
    >
    retentionFields: Record<
      'blocksPerAgent' | 'sessionsPerAgent' | 'sessionsForAgentPersona',
      { title: string; description: string }
    >
  }
  developer: {
    intro: string
    llmDebugTitle: string
    llmDebugDesc: string
    enableLlmDebug: string
    disableLlmDebug: string
  }
  googleWorkspace: {
    intro: string
    signInSectionTitle: string
    clientIdLabel: string
    clientIdPlaceholder: string
    clientIdHint: string
    clientSecretLabel: string
    clientSecretPlaceholder: string
    clientSecretHint: string
    redirectUriHint: string
    signInHint: string
    signInWithGoogle: string
    signedInHint: string
    missingScopes: string
    oauthNotConfigured: string
  }
  about: {
    intro: string
    sourceHint: string
  }
  support: {
    intro: string
    whatHappened: string
    placeholder: string
    includeMemory: string
    includeSandbox: string
    uploadEndpoint: string
    uploadHint: string
    bundleSavedTo: string
    uploadsRemainingToday: string
    uploadDailyLimitReached: string
  }
  accounts: {
    tabs: { google: string; github: string }
    google: {
      signedInHint: string
      signInHint: string
      signInWithGoogle: string
    }
    github: {
      signedInHint: string
      missingScopes: string
      readOrgHint: string
      signInHint: string
      signInWithGitHub: string
    }
  }
  mcp: {
    addServer: string
    noServers: string
    newServer: string
    envVars: string
    httpHeaders: string
    enableServer: string
    disableServer: string
    tools: string
    availableTools: string
    empty: string
    unsavedDraft: string
    addingServer: string
    addModeManual: string
    addModeRegistry: string
    registrySearch: string
    registrySearchPlaceholder: string
    registrySearching: string
    registryNoResults: string
    registryLoadMore: string
    registrySelectServer: string
    registryVersion: string
    registryTransports: string
    registryDescription: string
    registryRepository: string
    registryUseConfig: string
    registryConfigOption: string
    registryRequiredEnv: string
    registryRequiredHeaders: string
    registryLoadFailed: string
    registryBackToSearch: string
    registryConfigureTitle: string
    requiresNpxTitle: string
    requiresNpxHint: string
    requiresNpx: string
    requiresUvTitle: string
    requiresUvHint: string
    requiresUv: string
    installNode: string
    installUv: string
    launchCommand: string
    toolsLoadFailedTitle: string
    toolsUnavailableHint: string
  }
  scheduler: {
    addSchedule: string
    loadingSchedules: string
    noSchedules: string
    newSchedule: string
    editSchedule: string
    interval: string
    cron: string
    sendChannelMessage: string
    runAgent: string
    selectAgent: string
    noAgents: string
    agentMissing: string
    saving: string
    empty: string
    unsavedDraft: string
    saveToAddHint: string
  }
  toolset: {
    allTags: string
    noTools: string
    requiresApproval: string
    autoRun: string
    approvalBadge: string
    parameters: string
    defaultPrefix: string
    optionalParam: string
    requiredParam: string
    empty: string
  }
  agents: {
    tabs: {
      general: string
      configurations: string
      prompt: string
      toolset: string
      subagents: string
      mcp: string
    }
    promptTabs: { skill: string; attachments: string }
    configurationsIntro: string
    configurationsEmpty: string
    preview: string
    edit: string
    llmRouting: string
    oneProvider: string
    perStage: string
    stageLlms: string
    stageLlmsHint: string
    toolLoopMax: string
    toolLoopMaxHint: string
    todoRetries: string
    todoRetriesHint: string
    failureRecovery: string
    failureRecoveryHint: string
    sameAsToolLoop: string
    customRecovery: string
    color: string
    availableSet: string
    availableSetHint: string
    availableAsSubAgent: string
    availableAsSubAgentHint: string
    delegateToolLoop: string
    delegateToolLoopHint: string
    allowedTargets: string
    allowedTargetsHint: string
    noDelegatableAgents: string
    noMcpServers: string
    mcpServersHint: string
    enableSubAgent: string
    disableSubAgent: string
    enableDelegate: string
    disableDelegate: string
    workflowBadge: string
    allowTarget: string
    removeTarget: string
    namePlaceholder: string
    descriptionPlaceholder: string
    promptTabCompiledRuntime: string
    promptTabInstructions: string
    compilationLoadingStatus: string
    compilationReadyNotice: string
    compilationFailedNotice: string
    compilationMissingNotice: string
    colors: Record<
      'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral',
      string
    >
    stages: Record<
      'explore' | 'toolLoop' | 'toolLoopRecovery' | 'verifier',
      string
    >
  }
  skills: {
    hint: string
    loadingAll: string
    recompilingAll: string
    refreshing: string
    loadingList: string
    noSkills: string
    table: {
      skill: string
      source: string
      status: string
      compileLlm: string
      compileProvider: string
      compileModel: string
      compiled: string
      actions: string
    }
    status: {
      ready: string
      pending: string
      failed: string
      notLoaded: string
      stale: string
    }
    compileSource: {
      override: string
      fromProperties: string
    }
    editCompiledSkill: string
    compilationEditableHint: string
    compilationLoadHint: string
    statusPrefix: string
    fingerprintPrefix: string
    compiledPrefix: string
    saveEdits: string
    saving: string
    loadCompilation: string
    forceRecompile: string
    loadingStatus: string
    noArtifactYet: string
    instructionsSection: string
    attachmentsLoading: string
    compiling: string
    recompiling: string
    forceRecompileTitle: string
    attachmentsHint: string
    noAttachments: string
    download: string
    downloading: string
    attachmentCategories: Record<'ref' | 'script' | 'form', string>
  }
  clawhub: {
    title: string
    hint: string
    searchPlaceholder: string
    search: string
    searching: string
    install: string
    installing: string
    installedSuccess: string
    installFailed: string
    latestVersion: string
    preview: string
    installedTitle: string
    loadingInstalled: string
    noInstalled: string
    update: string
    checkUpdate: string
    updateAll: string
    updatingAll: string
    updateAllDone: string
    updated: string
    updateFailed: string
    uninstall: string
    uninstalled: string
    uninstallFailed: string
  }
}
