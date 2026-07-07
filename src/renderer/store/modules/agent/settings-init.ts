import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import {
  OPENAI_COMPATIBLE_LLM_PROVIDERS,
  OPENAI_COMPATIBLE_PROVIDER_IDS,
  openAiCompatibleProviderConfigKeys,
} from '@shared/agent/llm-provider-registry'
import { normalizeLlamaCppBaseURL } from '@shared/agent/llamacpp-url'
import {
  SYSTEM_PROP_KEYS,
  PROVIDER_SETUP_DISMISSED_KEY,
  ONBOARDING_COMPLETED_KEY,
  normalizeBaseURL,
  setSystemConfigValue,
  getSystemConfigValues,
} from './config'
import type { AgentStoreContext } from './agent-store-context'
import type { ConversationActions } from './conversation-actions'

export type SettingsInitDeps = {
  loadSkillsFromDisk: () => Promise<boolean>
}

export function createSettingsInitActions(
  ctx: AgentStoreContext,
  conversation: ConversationActions,
  deps: SettingsInitDeps,
) {
  const {
    log,
    agents,
    hasLoadedSettings,
    ollamaBaseURL,
    llamacppBaseURL,
    llamacppApiKey,
    anthropicApiKey,
    anthropicBaseURL,
    openaiApiKey,
    openaiBaseURL,
    geminiApiKey,
    geminiBaseURL,
    deepseekApiKey,
    deepseekApiUrl,
    zhipuApiKey,
    zhipuBaseURL,
    openAiCompatibleApiKeys,
    openAiCompatibleBaseUrls,
    isLoadingInitialConversations,
    hasLoadedInitialConversations,
    providerSetupDismissed,
    onboardingCompleted,
    selectedAgentId,
    focusedConversationId,
    conversationList,
    chatSelectableAgents,
  } = ctx
  const {
    selectConversation,
    loadConversationList,
    mostRecentConversation,
  } = conversation
  const { loadSkillsFromDisk } = deps

  async function initializeSettingsFromConfig() {
    if (hasLoadedSettings.value && agents.value.length > 0) return

    const [values] = await Promise.all([
      getSystemConfigValues([
        SYSTEM_PROP_KEYS.ollamaBaseURL,
        SYSTEM_PROP_KEYS.llamacppBaseURL,
        SYSTEM_PROP_KEYS.llamacppApiKey,
        SYSTEM_PROP_KEYS.anthropicApiKey,
        SYSTEM_PROP_KEYS.anthropicBaseURL,
        SYSTEM_PROP_KEYS.openaiApiKey,
        SYSTEM_PROP_KEYS.openaiBaseURL,
        SYSTEM_PROP_KEYS.geminiApiKey,
        SYSTEM_PROP_KEYS.geminiBaseURL,
        SYSTEM_PROP_KEYS.deepseekApiKey,
        SYSTEM_PROP_KEYS.deepseekApiUrl,
        SYSTEM_PROP_KEYS.zhipuApiKey,
        SYSTEM_PROP_KEYS.zhipuBaseURL,
        PROVIDER_SETUP_DISMISSED_KEY,
        ONBOARDING_COMPLETED_KEY,
        ...openAiCompatibleProviderConfigKeys(),
      ]),
      loadSkillsFromDisk(),
    ])

    ollamaBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.ollamaBaseURL] ?? ollamaBaseURL.value,
      'http://localhost:11434',
    )
    llamacppBaseURL.value = normalizeLlamaCppBaseURL(
      values[SYSTEM_PROP_KEYS.llamacppBaseURL] ?? llamacppBaseURL.value,
    )
    llamacppApiKey.value = (
      values[SYSTEM_PROP_KEYS.llamacppApiKey] ?? ''
    ).trim()
    anthropicApiKey.value = (
      values[SYSTEM_PROP_KEYS.anthropicApiKey] ?? ''
    ).trim()
    anthropicBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.anthropicBaseURL] ?? anthropicBaseURL.value,
      'https://api.anthropic.com/v1',
    )
    openaiApiKey.value = (values[SYSTEM_PROP_KEYS.openaiApiKey] ?? '').trim()
    openaiBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.openaiBaseURL] ?? openaiBaseURL.value,
      'https://api.openai.com/v1',
    )
    geminiApiKey.value = (values[SYSTEM_PROP_KEYS.geminiApiKey] ?? '').trim()
    geminiBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.geminiBaseURL] ?? geminiBaseURL.value,
      'https://generativelanguage.googleapis.com/v1beta',
    )
    deepseekApiKey.value = (
      values[SYSTEM_PROP_KEYS.deepseekApiKey] ?? ''
    ).trim()
    deepseekApiUrl.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.deepseekApiUrl] ?? deepseekApiUrl.value,
      'https://api.deepseek.com/v1',
    )
    zhipuApiKey.value = (values[SYSTEM_PROP_KEYS.zhipuApiKey] ?? '').trim()
    zhipuBaseURL.value = normalizeBaseURL(
      values[SYSTEM_PROP_KEYS.zhipuBaseURL] ?? zhipuBaseURL.value,
      'https://api.z.ai/api/paas/v4',
    )
    providerSetupDismissed.value =
      values[PROVIDER_SETUP_DISMISSED_KEY] === 'true' ||
      values[PROVIDER_SETUP_DISMISSED_KEY] === '1'
    onboardingCompleted.value =
      values[ONBOARDING_COMPLETED_KEY] === 'true' ||
      values[ONBOARDING_COMPLETED_KEY] === '1'

    if (!values[SYSTEM_PROP_KEYS.ollamaBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.ollamaBaseURL,
        ollamaBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.llamacppBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.llamacppBaseURL,
        llamacppBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.llamacppApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.llamacppApiKey,
        llamacppApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.anthropicApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.anthropicApiKey,
        anthropicApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.anthropicBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.anthropicBaseURL,
        anthropicBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.openaiApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.openaiApiKey,
        openaiApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.openaiBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.openaiBaseURL,
        openaiBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.geminiApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.geminiApiKey,
        geminiApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.geminiBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.geminiBaseURL,
        geminiBaseURL.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.deepseekApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.deepseekApiKey,
        deepseekApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.deepseekApiUrl]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.deepseekApiUrl,
        deepseekApiUrl.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.zhipuApiKey]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.zhipuApiKey,
        zhipuApiKey.value,
      )
    }
    if (!values[SYSTEM_PROP_KEYS.zhipuBaseURL]) {
      void setSystemConfigValue(
        SYSTEM_PROP_KEYS.zhipuBaseURL,
        zhipuBaseURL.value,
      )
    }

    for (const id of OPENAI_COMPATIBLE_PROVIDER_IDS) {
      const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[id]
      openAiCompatibleApiKeys.value = {
        ...openAiCompatibleApiKeys.value,
        [id]: (values[meta.apiKeyConfigKey] ?? '').trim(),
      }
      openAiCompatibleBaseUrls.value = {
        ...openAiCompatibleBaseUrls.value,
        [id]: normalizeBaseURL(
          values[meta.baseUrlConfigKey] ?? openAiCompatibleBaseUrls.value[id],
          meta.defaultBaseUrl,
        ),
      }
      if (!values[meta.apiKeyConfigKey]) {
        void setSystemConfigValue(
          meta.apiKeyConfigKey,
          openAiCompatibleApiKeys.value[id],
        )
      }
      if (!values[meta.baseUrlConfigKey]) {
        void setSystemConfigValue(
          meta.baseUrlConfigKey,
          openAiCompatibleBaseUrls.value[id],
        )
      }
    }

    if (agents.value.length === 0) {
      log.warn('Agent list empty after LoadSkills; retrying once')
      await loadSkillsFromDisk()
    }

    if (agents.value.length === 0) {
      log.error('No chat agents available — check main process logs for LoadSkills errors')
    }

    // Select the default skill on first load (prefer non-workflow chat agents).
    if (!selectedAgentId.value) {
      const pickFrom = chatSelectableAgents.value
      const defaultAgent = pickFrom.find(
        (agent) => agent.enabled && agent.name === 'Default',
      )
      const fallbackAgent = pickFrom[0]
      const initialAgent = defaultAgent ?? fallbackAgent
      if (initialAgent) {
        selectedAgentId.value = initialAgent.id
      }
    } else if (
      selectedAgentId.value &&
      isWorkflowPanelAgentId(selectedAgentId.value)
    ) {
      const fallback =
        chatSelectableAgents.value.find((a) => a.name === 'Default') ??
        chatSelectableAgents.value[0]
      if (fallback) selectedAgentId.value = fallback.id
    }

    hasLoadedSettings.value = true
  }

  async function loadInitialConversations(): Promise<void> {
    if (hasLoadedInitialConversations.value) return

    isLoadingInitialConversations.value = true
    try {
      await loadAllConversationLists()
      if (!focusedConversationId.value) {
        const recent = mostRecentConversation()
        if (recent) {
          await selectConversation(recent.id)
        }
      }
      hasLoadedInitialConversations.value = true
    } finally {
      isLoadingInitialConversations.value = false
    }
  }

  async function loadAllConversationLists(): Promise<void> {
    await Promise.all(
      agents.value.map((agent) =>
        conversationList.value[agent.id]
          ? Promise.resolve()
          : loadConversationList(agent.id),
      ),
    )
  }
  return {
    initializeSettingsFromConfig,
    loadInitialConversations,
    loadAllConversationLists,
  }
}
