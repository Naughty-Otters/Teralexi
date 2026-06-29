import type { SettingsPanelLabels } from './panel-label-types'
import type { ProviderSetupLabels } from './provider-setup-label-types'

export type AppLabels = {
  common: {
    loading: string
    close: string
    chars: string
    lines: string
    msgs: string
    px: string
    showConversationList: string
    hideConversationList: string
    resizeConversationList: string
  }
  app: {
    name: string
  }
  sidebar: {
    settings: string
    tokenMonitor: string
    openTokenMonitor: string
    workspace: string
    openWorkspace: string
    backToConversation: string
    switchToLight: string
    switchToDark: string
    chatDisplay: string
    workflows: string
    openWorkflows: string
    setupWizard: string
    openSetupWizard: string
  }
  settings: {
    title: string
    subtitle: string
    close: string
    tabs: {
      general: string
      accounts: string
      skills: string
      agents: string
      llm: string
      channels: string
      scheduler: string
      memory: string
      chat: string
      toolset: string
      mcp: string
      developer: string
      about: string
    }
    channels: {
      whatsapp: string
      telegram: string
      discord: string
      wechat: string
      slack: string
    }
    skillTabs: {
      installed: string
      clawhub: string
    }
    sections: {
      language: string
      appearance: string
      font: string
      chatUi: string
      developer: string
      about: string
      agentMemory: string
      skillCompilation: string
      newAgent: string
      ollama: string
      llamacpp: string
      openai: string
      anthropic: string
      gemini: string
      deepseek: string
      zhipu: string
      whatsapp: string
      telegram: string
      discord: string
      wechat: string
      slack: string
      githubAccount: string
      googleAccount: string
      googleWorkspace: string
      reportProblem: string
    }
    language: {
      intro: string
      label: string
      hint: string
      agentHint: string
    }
    font: {
      intro: string
      familyLabel: string
      familyHint: string
      sizeLabel: string
      sizeHint: string
      previewText: string
      customPreset: string
      presets: {
        menlo: string
        'sf-mono': string
        'system-mono': string
        'system-sans': string
      }
    }
    appearance: {
      intro: string
      modeLabel: string
      modeHint: string
      solid: string
      glass: string
      macNativeHint: string
      nonMacHint: string
    }
    panels: SettingsPanelLabels
  }
  chatUi: {
    intro: string
    preservedTextTitle: string
    preservedTextDesc: string
    compactHeightTitle: string
    compactHeightDesc: string
    contextWindowTitle: string
    contextWindowDesc: string
    reasoningMaxTitle: string
    reasoningMaxDesc: string
    showAgenticRunTitle: string
    showAgenticRunDesc: string
    toolCallListNone: string
    toolCallListAll: string
    toolCallListLatest: string
    thinkingBubbleTitle: string
    thinkingBubbleDesc: string
    thinkingBubbleNone: string
    thinkingBubbleAll: string
    thinkingBubbleLatest: string
    defaultsFootnote: string
  }
  chat: {
    thoughtBubbleTitle: string
    exportBubblePdf: string
    exportBubblePdfSuccess: string
    exportBubblePdfFailed: string
    copyBubbleContent: string
    copyBubbleContentSuccess: string
    copyBubbleContentFailed: string
    printBubbleContent: string
  }
  monitor: {
    title: string
    subtitle: string
  }
  workflows: {
    title: string
    subtitle: string
    newWorkflow: string
    newWorkflowPrompt: string
    selectOrCreate: string
    deleteWorkflow: string
    deleteDialog: {
      title: string
      message: string
      cancel: string
      confirm: string
      deleting: string
      success: string
      failed: string
    }
    createDialog: {
      title: string
      nameLabel: string
      namePlaceholder: string
      descriptionLabel: string
      descriptionPlaceholder: string
      cancel: string
      create: string
      creating: string
      createFailed: string
      nameRequired: string
    }
    tabs: {
      define: string
      test: string
      deploy: string
    }
    panelSkills: {
      label: string
    }
    studio: {
      promptPlaceholder: string
      send: string
      stop: string
      compiling: string
      chatReady: string
      confirm: string
      definition: string
      mermaid: string
      entities: string
      noDefinition: string
      noEntities: string
      welcome: string
      updated: string
      confirmed: string
      compileFailed: string
      confirmFailed: string
    }
    test: {
      run: string
      running: string
      needConfirmed: string
      passed: string
      failed: string
      steps: string
      mocks: string
    }
    deploy: {
      local: string
      undeploy: string
      runNow: string
      active: string
      runSuccess: string
      runFailed: string
    }
  }
  landing: {
    welcome: string
    buttonTips: string
    waitDataLoading: string
    about: {
      system: string
      language: string
      languageValue: string
      currentPagePath: string
      currentPageName: string
      vueVersion: string
      electronVersion: string
      nodeVersion: string
      systemPlatform: string
      systemVersion: string
      systemArch: string
      currentEnvironment: string
    }
    buttons: {
      console: string
      checkUpdate: string
      checkUpdate2: string
      checkUpdateInc: string
      viewMessage: string
      openNewWindow: string
      simulatedCrash: string
      changeLanguage: string
      forcedUpdate: string
    }
  }
  toast: {
    updateAvailableTitle: string
    updateAvailableDescription: string
  }
  titleBar: {
    updateAvailable: string
    updateDownloading: string
    updateReady: string
    openAbout: string
  }
  auth: {
    signInWithGoogle: string
    signingIn: string
    signInFailed: string
    signInRequiredTitle: string
    signInRequiredDesc: string
    localLlmHint: string
    openLocalLlmSettings: string
  }
  agentGuide: {
    title: string
    subtitle: string
    selected: string
  }
  signInGate: {
    settings: string
    monitor: string
    wizard: string
    llmCloud: string
  }
  providerSetup: ProviderSetupLabels
}

export type AppLocaleBundle = AppLabels
