export type ProviderSetupGuideCopy = {
  intro: string
  steps: readonly string[]
}

export type ProviderSetupLabels = {
  wizard: {
    title: string
    subtitle: string
    chooseMode: string
    localTitle: string
    localDesc: string
    cloudTitle: string
    cloudDesc: string
    pickProvider: string
    back: string
    continue: string
    skipForNow: string
    openConsole: string
    openConsoleHint: string
    openDocs: string
    openInstall: string
    openInstallHint: string
    testAndSave: string
    testing: string
    testSuccess: string
    testFailed: string
    modelsFound: string
    setupGuide: string
    getStarted: string
    openSettings: string
    stepLlm: string
    stepAgents: string
    agentsTitle: string
    agentsSubtitle: string
    applyToAll: string
    allAgentsReady: string
    agentsIncomplete: string
    finishSetup: string
    continueToAgents: string
    rampUpTitle: string
    rampUpSubtitle: string
    configuredProvidersHint: string
    addAnotherProvider: string
    alreadyConfigured: string
    next: string
  }
  landing: {
    title: string
    subtitle: string
    cta: string
  }
  providers: Record<string, ProviderSetupGuideCopy>
}
