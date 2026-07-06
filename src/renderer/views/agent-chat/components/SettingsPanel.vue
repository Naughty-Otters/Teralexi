<template>
  <!-- Settings header -->
  <div class="chat-header">
    <div class="chat-header-left">
      <UIcon
        name="i-lucide-settings"
        style="width: 18px; height: 18px; color: var(--ui-text-muted)"
      />
      <div class="chat-header-info">
        <p class="chat-header-name">{{ t.settings.title }}</p>
        <p class="chat-header-meta">{{ t.settings.subtitle }}</p>
      </div>
    </div>
    <button class="icon-btn" :title="t.settings.close" @click="emit('close')">
      ✕
    </button>
  </div>

  <div class="sp-scroll">
    <!-- Provider Tabs -->
    <div class="sp-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="sp-tab"
        :class="{ 'sp-tab--active': settingsTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        <span class="sp-tab-label">{{ tab.label }}</span>
        <UIcon
          v-if="tab.requiresSignIn && !isSignedIn"
          name="i-lucide-lock"
          class="sp-tab-lock"
          aria-hidden="true"
        />
      </button>
    </div>

    <!-- Top-level tab panels -->
    <div class="sp-panel-frame">
      <SignInRequiredPanel
        v-if="activeTabRequiresSignIn"
        :description="signInGateDescription"
        :hint="t.auth.localLlmHint"
        :secondary-action-label="t.auth.openLocalLlmSettings"
        @secondary-action="openLocalLlmSettings"
      />
      <div v-else-if="settingsTab === 'general'" class="sp-general-panel">
        <LanguageSetting />
        <AppearanceSetting />
        <FontSetting />
        <EditorSetting />
      </div>
      <section v-else-if="settingsTab === 'llm'" class="sp-llm-section sp-panel-view">
        <p v-if="!isSignedIn" class="sp-sign-in-hint">{{ t.signInGate.llmCloud }}</p>
        <div class="sp-llm-layout">
          <aside class="sp-llm-sidebar" aria-label="LLM providers">
            <template
              v-for="entry in llmSidebarEntries"
              :key="entry.kind === 'header' ? entry.id : entry.id"
            >
              <div
                v-if="entry.kind === 'header'"
                class="sp-llm-group-header"
                :class="`sp-llm-group-header--${entry.category}`"
              >
                {{ entry.label }}
              </div>
              <button
                v-else
                type="button"
                class="sp-llm-item"
                :class="{ 'sp-llm-item--active': llmVendorTab === entry.id }"
                @click="switchLlmVendor(entry.id)"
              >
                {{ entry.label }}
              </button>
            </template>
          </aside>

          <div class="sp-llm-content">
            <OllamaSetting v-if="llmVendorTab === 'ollama'" class="sp-panel-view" />
            <LlamaCppSetting
              v-else-if="llmVendorTab === 'llamacpp'"
              class="sp-panel-view"
            />
            <OpenAISetting
              v-else-if="llmVendorTab === 'openai'"
              class="sp-panel-view"
            />
            <AnthropicSetting
              v-else-if="llmVendorTab === 'anthropic'"
              class="sp-panel-view"
            />
            <GeminiSetting
              v-else-if="llmVendorTab === 'gemini'"
              class="sp-panel-view"
            />
            <DeepSeekSetting
              v-else-if="llmVendorTab === 'deepseek'"
              class="sp-panel-view"
            />
            <ZhipuSetting
              v-else-if="llmVendorTab === 'zhipu'"
              class="sp-panel-view"
            />
            <OpenAiCompatibleProviderSetting
              v-else-if="isOpenAiCompatibleProvider(llmVendorTab)"
              :provider="llmVendorTab"
              class="sp-panel-view"
            />
          </div>
        </div>
      </section>
      <McpSetting v-else-if="settingsTab === 'mcp'" class="sp-panel-view" />
      <ToolSetSetting
        v-else-if="settingsTab === 'toolset'"
        class="sp-panel-view"
      />
      <div v-else-if="settingsTab === 'skills'" class="sp-panel-view">
        <div class="sp-tabs sp-tabs--nested">
          <button
            v-for="st in skillTabs"
            :key="st.id"
            class="sp-tab"
            :class="{ 'sp-tab--active': skillTab === st.id }"
            @click="skillTab = st.id"
          >
            {{ st.label }}
          </button>
        </div>
        <ClawHubSkillRegistry
          v-if="skillTab === 'clawhub'"
          class="sp-panel-view"
        />
        <SkillCompilationsSetting
          v-else
          class="sp-panel-view"
        />
      </div>
      <AgentConfigurationPanel
        v-else-if="settingsTab === 'agents'"
        class="sp-panel-view"
      />
      <div v-else-if="settingsTab === 'channels'" class="sp-panel-view">
        <div class="sp-tabs sp-tabs--nested">
          <button
            v-for="ch in channelTabs"
            :key="ch.id"
            class="sp-tab"
            :class="{ 'sp-tab--active': channelTab === ch.id }"
            @click="channelTab = ch.id"
          >
            {{ ch.label }}
          </button>
        </div>
        <WhatsAppSetting v-if="channelTab === 'whatsapp'" class="sp-panel-view" />
        <TelegramSetting v-else-if="channelTab === 'telegram'" class="sp-panel-view" />
        <DiscordSetting v-else-if="channelTab === 'discord'" class="sp-panel-view" />
        <WeChatSetting v-else-if="channelTab === 'wechat'" class="sp-panel-view" />
        <SlackSetting v-else-if="channelTab === 'slack'" class="sp-panel-view" />
      </div>
      <AccountsSetting
        v-else-if="settingsTab === 'accounts'"
        class="sp-panel-view"
      />
      <SchedulerSetting
        v-else-if="settingsTab === 'scheduler'"
        class="sp-panel-view"
      />
      <MemorySetting
        v-else-if="settingsTab === 'memory'"
        class="sp-panel-view"
      />
      <ChatUiSetting
        v-else-if="settingsTab === 'chat'"
        class="sp-panel-view"
      />
      <DeveloperSetting
        v-else-if="settingsTab === 'developer'"
        class="sp-panel-view"
      />
      <AboutUpdatePanel
        v-else-if="settingsTab === 'about'"
        class="sp-panel-view"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import { useAgentStore } from '@store/agent'
import {
  isOpenAiCompatibleProvider,
  LLM_PROVIDER_LABELS,
  type ProviderType,
} from '@shared/agent/llm-provider-registry'
import {
  LOCAL_LLM_PROVIDER_IDS,
  VENDOR_LLM_PROVIDER_IDS,
  WHOLESALE_LLM_PROVIDER_IDS,
} from '@shared/agent/provider-setup-guides'
import { isSignedInOnlySettingsTab } from '@shared/auth/signed-in-features'
import SignInRequiredPanel from './SignInRequiredPanel.vue'
import FontSetting from './settings/FontSetting.vue'
import AppearanceSetting from './settings/AppearanceSetting.vue'
import EditorSetting from './settings/EditorSetting.vue'
import LanguageSetting from './settings/LanguageSetting.vue'
import OllamaSetting from './settings/OllamaSetting.vue'
import LlamaCppSetting from './settings/LlamaCppSetting.vue'
import OpenAISetting from './settings/OpenAISetting.vue'
import AnthropicSetting from './settings/AnthropicSetting.vue'
import GeminiSetting from './settings/GeminiSetting.vue'
import DeepSeekSetting from './settings/DeepSeekSetting.vue'
import ZhipuSetting from './settings/ZhipuSetting.vue'
import OpenAiCompatibleProviderSetting from './settings/OpenAiCompatibleProviderSetting.vue'

const McpSetting = defineAsyncComponent(
  () => import('./settings/McpSetting.vue'),
)
const ToolSetSetting = defineAsyncComponent(
  () => import('./settings/ToolSetSetting.vue'),
)
const AgentConfigurationPanel = defineAsyncComponent(
  () => import('./settings/AgentConfigurationPanel.vue'),
)
const SkillCompilationsSetting = defineAsyncComponent(
  () => import('./settings/SkillCompilationsSetting.vue'),
)
const ClawHubSkillRegistry = defineAsyncComponent(
  () => import('./settings/ClawHubSkillRegistry.vue'),
)
const AccountsSetting = defineAsyncComponent(
  () => import('./settings/AccountsSetting.vue'),
)
const WhatsAppSetting = defineAsyncComponent(
  () => import('./settings/WhatsAppSetting.vue'),
)
const TelegramSetting = defineAsyncComponent(
  () => import('./settings/TelegramSetting.vue'),
)
const DiscordSetting = defineAsyncComponent(
  () => import('./settings/DiscordSetting.vue'),
)
const WeChatSetting = defineAsyncComponent(
  () => import('./settings/WeChatSetting.vue'),
)
const SlackSetting = defineAsyncComponent(
  () => import('./settings/SlackSetting.vue'),
)
const SchedulerSetting = defineAsyncComponent(
  () => import('./settings/SchedulerSetting.vue'),
)
const MemorySetting = defineAsyncComponent(
  () => import('./settings/MemorySetting.vue'),
)
const ChatUiSetting = defineAsyncComponent(
  () => import('./settings/ChatUiSetting.vue'),
)
const DeveloperSetting = defineAsyncComponent(
  () => import('./settings/DeveloperSetting.vue'),
)
const AboutUpdatePanel = defineAsyncComponent(
  () => import('./settings/AboutUpdatePanel.vue'),
)
import {
  registerSettingsTabHandler,
} from '@renderer/composables/useAppUpdateNavigation'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { isSignedIn } = useGoogleAccount()

const agentStore = useAgentStore()
type SettingsTab =
  | 'general'
  | 'llm'
  | 'mcp'
  | 'toolset'
  | 'skills'
  | 'agents'
  | 'channels'
  | 'accounts'
  | 'scheduler'
  | 'memory'
  | 'chat'
  | 'developer'
  | 'about'
const settingsTab = ref<SettingsTab>('general')
const llmVendorTab = ref<ProviderType>('ollama')

type LlmProviderGroupId = 'local' | 'vendor' | 'wholesale'

type LlmSidebarEntry =
  | { kind: 'header'; id: string; category: LlmProviderGroupId; label: string }
  | { kind: 'provider'; id: ProviderType; label: string }

const llmSidebarEntries = computed((): LlmSidebarEntry[] => {
  const groups = isSignedIn.value
    ? [
        {
          id: 'local',
          label: t.value.settings.llmGroups.local,
          ids: LOCAL_LLM_PROVIDER_IDS,
        },
        {
          id: 'vendor',
          label: t.value.settings.llmGroups.vendor,
          ids: VENDOR_LLM_PROVIDER_IDS,
        },
        {
          id: 'wholesale',
          label: t.value.settings.llmGroups.wholesale,
          ids: WHOLESALE_LLM_PROVIDER_IDS,
        },
      ]
    : [
        {
          id: 'local',
          label: t.value.settings.llmGroups.local,
          ids: LOCAL_LLM_PROVIDER_IDS,
        },
      ]

  const entries: LlmSidebarEntry[] = []
  for (const group of groups) {
    entries.push({
      kind: 'header',
      id: `header-${group.id}`,
      category: group.id,
      label: group.label,
    })
    for (const id of group.ids) {
      entries.push({
        kind: 'provider',
        id,
        label: LLM_PROVIDER_LABELS[id],
      })
    }
  }
  return entries
})

const llmProviderIds = computed(() =>
  llmSidebarEntries.value
    .filter((entry): entry is Extract<LlmSidebarEntry, { kind: 'provider' }> => entry.kind === 'provider')
    .map((entry) => entry.id),
)

type ChannelTab = 'whatsapp' | 'telegram' | 'discord' | 'wechat' | 'slack'
const channelTab = ref<ChannelTab>('whatsapp')
type SkillTab = 'clawhub' | 'installed'
const skillTab = ref<SkillTab>('installed')
const channelTabs = computed(() => [
  { id: 'whatsapp' as ChannelTab, label: t.value.settings.channels.whatsapp },
  { id: 'telegram' as ChannelTab, label: t.value.settings.channels.telegram },
  { id: 'discord' as ChannelTab, label: t.value.settings.channels.discord },
  { id: 'wechat' as ChannelTab, label: t.value.settings.channels.wechat },
  { id: 'slack' as ChannelTab, label: t.value.settings.channels.slack },
])

const skillTabs = computed(() => [
  { id: 'installed' as SkillTab, label: t.value.settings.skillTabs.installed },
  { id: 'clawhub' as SkillTab, label: t.value.settings.skillTabs.clawhub },
])

const tabs = computed(() => [
  { id: 'general' as SettingsTab, label: t.value.settings.tabs.general, requiresSignIn: false },
  { id: 'accounts' as SettingsTab, label: t.value.settings.tabs.accounts, requiresSignIn: false },
  { id: 'skills' as SettingsTab, label: t.value.settings.tabs.skills, requiresSignIn: true },
  { id: 'agents' as SettingsTab, label: t.value.settings.tabs.agents, requiresSignIn: true },
  { id: 'llm' as SettingsTab, label: t.value.settings.tabs.llm, requiresSignIn: false },
  { id: 'channels' as SettingsTab, label: t.value.settings.tabs.channels, requiresSignIn: true },
  { id: 'scheduler' as SettingsTab, label: t.value.settings.tabs.scheduler, requiresSignIn: true },
  { id: 'memory' as SettingsTab, label: t.value.settings.tabs.memory, requiresSignIn: true },
  { id: 'chat' as SettingsTab, label: t.value.settings.tabs.chat, requiresSignIn: true },
  { id: 'toolset' as SettingsTab, label: t.value.settings.tabs.toolset, requiresSignIn: false },
  { id: 'mcp' as SettingsTab, label: t.value.settings.tabs.mcp, requiresSignIn: true },
  { id: 'developer' as SettingsTab, label: t.value.settings.tabs.developer, requiresSignIn: true },
  { id: 'about' as SettingsTab, label: t.value.settings.tabs.about, requiresSignIn: false },
])

const activeTabRequiresSignIn = computed(
  () => !isSignedIn.value && isSignedInOnlySettingsTab(settingsTab.value),
)

const signInGateDescription = computed(() => t.value.signInGate.settings)

function openLocalLlmSettings() {
  settingsTab.value = 'llm'
  llmVendorTab.value = 'ollama'
  agentStore.fetchModelsForProvider('ollama')
}

function switchTab(tab: SettingsTab) {
  settingsTab.value = tab
  if (tab === 'llm') {
    const vendor = llmVendorTab.value
    const allowed = llmProviderIds.value.includes(vendor)
    if (!allowed) {
      llmVendorTab.value = llmProviderIds.value[0] ?? 'ollama'
    }
    agentStore.fetchModelsForProvider(llmVendorTab.value)
  }
}

function switchLlmVendor(tab: ProviderType) {
  llmVendorTab.value = tab
  agentStore.fetchModelsForProvider(tab)
}

onMounted(() => {
  registerSettingsTabHandler((tab) => {
    if (tab === 'about' || tab === 'llm') {
      switchTab(tab as SettingsTab)
    }
  })

  const pendingTab = sessionStorage.getItem('teralexi.settingsTab')
  if (pendingTab === 'llm' || pendingTab === 'about') {
    sessionStorage.removeItem('teralexi.settingsTab')
    switchTab(pendingTab as SettingsTab)
  }
})

onUnmounted(() => {
  registerSettingsTabHandler(null)
})
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--agent-header-min-height, 64px);
  padding: var(--agent-header-padding-y, 10px) var(--agent-header-padding-x, 20px);
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  flex-shrink: 0;
}
.chat-header-leading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.chat-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chat-header-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
  margin: 0;
}
.chat-header-meta {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 15px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.icon-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}
.icon-btn--active {
  color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
}

.sp-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.sp-tabs {
  display: flex;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 4px;
  gap: 0;
}
.sp-tabs--nested {
  margin-bottom: 10px;
}
.sp-tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--ui-text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition:
    color 0.12s,
    border-color 0.12s;
  white-space: nowrap;
}
.sp-tab:hover {
  color: var(--ui-text);
}
.sp-tab--active {
  color: var(--color-primary-500);
  border-bottom-color: var(--color-primary-500);
  font-weight: 600;
}

.sp-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sp-tab-lock {
  width: 12px;
  height: 12px;
  opacity: 0.65;
}

.sp-sign-in-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--color-primary-500) 6%, var(--ui-bg));
  border: 1px solid color-mix(in srgb, var(--color-primary-500) 18%, var(--ui-border));
}

.sp-llm-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.sp-llm-layout {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
}

.sp-llm-sidebar {
  width: 188px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
  background: var(--ui-bg-elevated);
}

.sp-llm-group-header {
  display: flex;
  align-items: center;
  margin: 8px 4px 4px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow: inset 3px 0 0 var(--sp-llm-group-accent, var(--color-primary-500));
  color: var(--sp-llm-group-text, var(--color-primary-700));
  background: color-mix(
    in srgb,
    var(--sp-llm-group-accent, var(--color-primary-500)) 14%,
    var(--ui-bg-elevated)
  );
  border: 1px solid
    color-mix(
      in srgb,
      var(--sp-llm-group-accent, var(--color-primary-500)) 28%,
      var(--ui-border)
    );
}

.sp-llm-group-header:first-child {
  margin-top: 2px;
}

.sp-llm-group-header--local {
  --sp-llm-group-accent: var(--color-success-500, #22c55e);
  --sp-llm-group-text: var(--color-success-700, #15803d);
}

.sp-llm-group-header--vendor {
  --sp-llm-group-accent: var(--color-info-500, #0ea5e9);
  --sp-llm-group-text: var(--color-info-700, #0369a1);
}

.sp-llm-group-header--wholesale {
  --sp-llm-group-accent: var(--color-secondary-500, #8b5cf6);
  --sp-llm-group-text: var(--color-secondary-700, #6d28d9);
}

:global(html.dark .sp-llm-group-header--local) {
  --sp-llm-group-text: var(--color-success-300, #86efac);
}

:global(html.dark .sp-llm-group-header--vendor) {
  --sp-llm-group-text: var(--color-info-300, #7dd3fc);
}

:global(html.dark .sp-llm-group-header--wholesale) {
  --sp-llm-group-text: var(--color-secondary-300, #c4b5fd);
}

.sp-llm-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  transition:
    background 0.12s,
    color 0.12s;
}

.sp-llm-item:hover {
  background: var(--ui-bg-accented);
}

.sp-llm-item--active {
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
  color: var(--color-primary-600);
  font-weight: 600;
}

:global(html.dark .sp-llm-item--active) {
  color: var(--color-primary-400);
}

.sp-llm-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
}

.sp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.sp-panel-frame {
  flex: 1;
  min-height: 0;
}

.sp-panel-view {
  height: 100%;
  min-height: 0;
}

.sp-general-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sp-general-panel :deep(.sp-section) {
  flex-shrink: 0;
}

:deep(.sp-panel-view) {
  height: 100%;
  min-height: 0;
}
.sp-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
}
.sp-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
}
.sp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sp-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.sp-input {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.sp-input:focus {
  border-color: var(--color-primary-500);
}
.sp-textarea {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  resize: vertical;
  line-height: 1.55;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.sp-textarea:focus {
  border-color: var(--color-primary-500);
}
.sp-select {
  appearance: auto;
  cursor: pointer;
}
</style>
