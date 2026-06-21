import type { SettingsPanelLabels } from './panel-label-types'

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
      googleOAuth: string
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
    defaultsFootnote: string
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
}

export type AppLocaleBundle = AppLabels
