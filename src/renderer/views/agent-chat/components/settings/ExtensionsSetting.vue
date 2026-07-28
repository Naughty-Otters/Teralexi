<template>
  <SettingsSplitLayout
    storage-key="teralexi.settings.extensionsSidebarWidth"
    :default-width="200"
    sidebar-class="ext-sidebar"
  >
    <template #sidebar>
      <div v-if="agentStore.extensions.length === 0" class="ext-sidebar-empty">
        {{ p.extensions.noExtensions }}
      </div>

      <button
        v-for="extension in agentStore.extensions"
        :key="extension.id"
        type="button"
        class="ext-tab"
        :class="{
          'ext-tab--active': selectedId === extension.id,
          'ext-tab--disabled': !extension.enabled,
        }"
        @click="selectedId = extension.id"
      >
        <span
          class="ext-tab-dot"
          :class="extension.enabled ? 'ext-tab-dot--on' : 'ext-tab-dot--off'"
        />
        <span class="ext-tab-name">{{ extension.id }}</span>
        <span
          v-if="extension.pendingHookReviews > 0"
          class="ext-tab-badge ext-tab-badge--pending"
        >
          {{ p.extensions.reviewRequired }}
        </span>
        <span class="ext-tab-badge" :class="`ext-tab-badge--${extension.source}`">
          {{ sourceLabel(extension.source) }}
        </span>
      </button>
    </template>

    <section v-if="selectedExtension" class="ext-content ext-section">
      <div class="ext-section-title-row">
        <span class="ext-section-title">{{ selectedExtension.id }}</span>
        <label
          class="sp-toggle"
          :title="
            selectedExtension.enabled
              ? p.extensions.disableExtension
              : p.extensions.enableExtension
          "
        >
          <input
            type="checkbox"
            :checked="selectedExtension.enabled"
            @change="onToggleEnabled"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': selectedExtension.enabled }"
          />
        </label>
      </div>

      <div class="ext-content-body">
        <div
          v-if="!selectedExtension.enabled"
          class="ext-callout"
        >
          <p class="ext-callout__text">{{ p.extensions.contributionsInactive }}</p>
        </div>
        <div
          v-else-if="pendingForSelected.length > 0"
          class="ext-callout ext-callout--warning"
        >
          <p class="ext-callout__text">{{ p.extensions.trustRequiredHint }}</p>
        </div>

        <div class="ext-detail-card">
          <div class="ext-detail-row">
            <span class="ext-detail-key">{{ p.extensions.version }}</span>
            <span class="ext-detail-val">{{ selectedExtension.version }}</span>
          </div>
          <div class="ext-detail-row">
            <span class="ext-detail-key">{{ p.extensions.source }}</span>
            <span class="ext-detail-val">{{ sourceLabel(selectedExtension.source) }}</span>
          </div>
          <div v-if="activationEventsLabel" class="ext-detail-row">
            <span class="ext-detail-key">{{ p.extensions.activationEvents }}</span>
            <span class="ext-detail-val ext-detail-val--mono">{{ activationEventsLabel }}</span>
          </div>
          <div class="ext-detail-row">
            <span class="ext-detail-key">{{ p.extensions.hooks }}</span>
            <span class="ext-detail-val">{{ selectedExtension.hookEvents.length }}</span>
          </div>
        </div>

        <div v-if="selectedProviders.length > 0" class="ext-contrib-list">
          <p class="ext-hooks-heading">{{ p.extensions.contributedProviders }}</p>
          <div
            v-for="provider in selectedProviders"
            :key="provider.registryId"
            class="ext-contrib-item"
          >
            <span
              class="ext-tab-dot"
              :class="contributionsActive ? 'ext-tab-dot--on' : 'ext-tab-dot--off'"
            />
            <span class="ext-contrib-name">{{ provider.label }}</span>
            <span class="ext-contrib-meta">{{ provider.providerId }}</span>
            <span class="ext-contrib-status">
              {{ contributionsActive ? p.extensions.active : p.extensions.inactive }}
            </span>
          </div>
        </div>

        <div v-if="selectedChannels.length > 0" class="ext-contrib-list">
          <p class="ext-hooks-heading">{{ p.extensions.contributedChannels }}</p>
          <div
            v-for="channel in selectedChannels"
            :key="channel.registryId"
            class="ext-contrib-item"
          >
            <span
              class="ext-tab-dot"
              :class="contributionsActive ? 'ext-tab-dot--on' : 'ext-tab-dot--off'"
            />
            <span class="ext-contrib-name">{{ channel.channelId }}</span>
            <span class="ext-contrib-meta">{{ channel.registryId }}</span>
            <span class="ext-contrib-status">
              {{ contributionsActive ? p.extensions.active : p.extensions.inactive }}
            </span>
          </div>
        </div>

        <div v-if="selectedExtension.hookEvents.length > 0" class="ext-contrib-list">
          <p class="ext-hooks-heading">{{ p.extensions.contributedHooks }}</p>
          <div
            v-for="event in selectedExtension.hookEvents"
            :key="event"
            class="ext-hook-item"
          >
            {{ event }}
          </div>
        </div>

        <div v-if="pendingForSelected.length > 0" class="ext-contrib-list">
          <p class="ext-hooks-heading">{{ p.extensions.pendingHooks }}</p>
          <div
            v-for="review in pendingForSelected"
            :key="review.trustKey"
            class="ext-trust-card"
          >
            <div class="ext-hook-item">{{ review.sourcePath }}</div>
            <div
              v-if="review.events.length > 0"
              class="ext-hook-item ext-detail-val--mono"
            >
              {{ review.events.join(', ') }}
            </div>
            <div class="ext-trust-actions">
              <button
                type="button"
                class="sp-action-btn sp-action-btn--confirm"
                @click="approveReview(review)"
              >
                {{ p.extensions.approveHooks }}
              </button>
              <button
                type="button"
                class="sp-action-btn sp-action-btn--cancel"
                @click="rejectReview(review)"
              >
                {{ p.extensions.rejectHooks }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="permissionEntries.length > 0" class="ext-contrib-list">
          <p class="ext-hooks-heading">{{ p.extensions.permissions }}</p>
          <div
            v-for="entry in permissionEntries"
            :key="entry.label"
            class="ext-hook-item"
          >
            {{ entry.label }}: {{ entry.value }}
          </div>
        </div>

        <div v-if="selectedUiPanels.length > 0" class="ext-contrib-list">
          <p class="ext-hooks-heading">{{ p.extensions.contributedPanels }}</p>
          <div
            v-for="panel in selectedUiPanels"
            :key="panel.registryId"
            class="ext-contrib-item"
          >
            <span
              class="ext-tab-dot"
              :class="contributionsActive ? 'ext-tab-dot--on' : 'ext-tab-dot--off'"
            />
            <span class="ext-contrib-name">{{ panel.label }}</span>
            <span class="ext-contrib-status">
              {{ contributionsActive ? p.extensions.active : p.extensions.inactive }}
            </span>
          </div>
          <ExtensionUiPanelHost
            v-for="panel in selectedUiPanels"
            :key="`${panel.registryId}-host`"
            :panel="panel"
          />
        </div>
      </div>
    </section>

    <section v-else class="ext-content ext-empty">
      <span>{{ p.extensions.empty }}</span>
    </section>
  </SettingsSplitLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import type { ExtensionSummary } from '@store/agent/types'
import type { PendingHookReview } from '@store/agent/agent-extensions'
import type {
  ExtensionChannelSummary,
  ExtensionLlmProviderSummary,
  ExtensionUiPanelSummary,
} from '@shared/agent/extension-contributions'
import { DEFAULT_USER_ID } from '@store/agent/config'
import ExtensionUiPanelHost from './ExtensionUiPanelHost.vue'
import SettingsSplitLayout from './SettingsSplitLayout.vue'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const selectedId = ref<string | null>(null)
const pendingReviews = ref<PendingHookReview[]>([])
const extensionUiPanels = ref<ExtensionUiPanelSummary[]>([])
const extensionProviders = ref<ExtensionLlmProviderSummary[]>([])
const extensionChannels = ref<ExtensionChannelSummary[]>([])

const selectedExtension = computed<ExtensionSummary | null>(
  () => agentStore.extensions.find((ext) => ext.id === selectedId.value) ?? null,
)

const contributionsActive = computed(() => Boolean(selectedExtension.value?.enabled))

const selectedUiPanels = computed(() =>
  extensionUiPanels.value.filter(
    (panel) => panel.extensionId === selectedExtension.value?.id,
  ),
)

const selectedProviders = computed(() =>
  extensionProviders.value.filter(
    (provider) => provider.extensionId === selectedExtension.value?.id,
  ),
)

const selectedChannels = computed(() =>
  extensionChannels.value.filter(
    (channel) => channel.extensionId === selectedExtension.value?.id,
  ),
)

const pendingForSelected = computed(() =>
  pendingReviews.value.filter(
    (review) => review.extensionId === selectedExtension.value?.id,
  ),
)

const activationEventsLabel = computed(() =>
  (selectedExtension.value?.activationEvents ?? []).join(', '),
)

const permissionEntries = computed(() => {
  const permissions = selectedExtension.value?.permissions
  if (!permissions) return []
  return Object.entries(permissions)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ({
      label: key,
      value: Array.isArray(value) ? value.join(', ') : String(value),
    }))
})

function sourceLabel(source: ExtensionSummary['source']): string {
  if (source === 'bundled') return p.value.extensions.bundled
  if (source === 'project') return p.value.extensions.project
  return p.value.extensions.installed
}

async function refreshPendingReviews(): Promise<void> {
  pendingReviews.value = await agentStore.listPendingHookReviews()
}

async function refreshContributions(): Promise<void> {
  const args = { userId: DEFAULT_USER_ID }
  const panelsChannel = window.ipcRendererChannel?.ListExtensionUiPanels
  const providersChannel = window.ipcRendererChannel?.ListExtensionLlmProviders
  const channelsChannel = window.ipcRendererChannel?.ListExtensionChannels

  if (panelsChannel?.invoke) {
    const list = (await panelsChannel.invoke(args)) as
      | ExtensionUiPanelSummary[]
      | undefined
    extensionUiPanels.value = Array.isArray(list) ? list : []
  } else {
    extensionUiPanels.value = []
  }

  if (providersChannel?.invoke) {
    const list = (await providersChannel.invoke(args)) as
      | ExtensionLlmProviderSummary[]
      | undefined
    extensionProviders.value = Array.isArray(list) ? list : []
  } else {
    extensionProviders.value = []
  }

  if (channelsChannel?.invoke) {
    const list = (await channelsChannel.invoke(args)) as
      | ExtensionChannelSummary[]
      | undefined
    extensionChannels.value = Array.isArray(list) ? list : []
  } else {
    extensionChannels.value = []
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([refreshPendingReviews(), refreshContributions()])
}

async function onToggleEnabled(): Promise<void> {
  if (!selectedExtension.value) return
  await agentStore.toggleExtensionEnabled(selectedExtension.value.id)
  await refreshAll()
}

async function approveReview(review: PendingHookReview): Promise<void> {
  await agentStore.setHookTrustStatus(review, 'trusted')
  await refreshAll()
}

async function rejectReview(review: PendingHookReview): Promise<void> {
  await agentStore.setHookTrustStatus(review, 'rejected')
  await refreshAll()
}

function onContributionsChanged(): void {
  void refreshAll()
}

watch(selectedId, () => {
  void refreshContributions()
})

onMounted(() => {
  void agentStore.loadExtensions().then(() => {
    if (agentStore.extensions.length > 0 && !selectedId.value) {
      selectedId.value = agentStore.extensions[0]!.id
    }
    void refreshAll()
  })
  window.addEventListener(
    'teralexi:extension-contributions-changed',
    onContributionsChanged,
  )
})

onUnmounted(() => {
  window.removeEventListener(
    'teralexi:extension-contributions-changed',
    onContributionsChanged,
  )
})
</script>

<style scoped>
@import './sp-shared.css';

.ext-sidebar-empty {
  font-size: 11px;
  color: var(--ui-text-muted);
  padding: 6px 10px;
  opacity: 0.7;
}

.ext-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--ui-text);
  transition: background 0.12s;
}

.ext-tab:hover {
  background: var(--ui-bg-accented);
}

.ext-tab--active {
  background: var(--ui-bg-accented);
}

.ext-tab--disabled {
  opacity: 0.5;
}

.ext-tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ext-tab-dot--on {
  background: var(--color-success-500, #22c55e);
}

.ext-tab-dot--off {
  background: var(--ui-border);
}

.ext-tab-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ext-tab-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-text-muted) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-text-muted) 22%, transparent);
}

.ext-tab-badge--bundled {
  color: var(--color-primary-700, #4f46e5);
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 35%, transparent);
}

.ext-tab-badge--user {
  color: var(--color-success-700, #15803d);
  background: color-mix(in srgb, var(--color-success-500, #22c55e) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-success-500, #22c55e) 35%, transparent);
}

.ext-tab-badge--project {
  color: var(--color-warning-700, #b45309);
  background: color-mix(in srgb, var(--color-warning-500, #f59e0b) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-warning-500, #f59e0b) 35%, transparent);
}

.ext-tab-badge--pending {
  color: var(--color-error-700, #b91c1c);
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-error-500, #ef4444) 35%, transparent);
}

:global(html.dark .ext-tab-badge--bundled) {
  color: var(--color-primary-300, #a5b4fc);
}

:global(html.dark .ext-tab-badge--user) {
  color: var(--color-success-300, #86efac);
}

:global(html.dark .ext-tab-badge--project) {
  color: var(--color-warning-300, #fcd34d);
}

:global(html.dark .ext-tab-badge--pending) {
  color: var(--color-error-300, #fca5a5);
}

.ext-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ext-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}

.ext-section-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 0;
}

.ext-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ext-callout {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--ui-text-muted) 25%, transparent);
  background: color-mix(in srgb, var(--ui-text-muted) 8%, transparent);
}

.ext-callout--warning {
  border-color: color-mix(in srgb, var(--color-warning-500, #f59e0b) 35%, transparent);
  background: color-mix(in srgb, var(--color-warning-500, #f59e0b) 10%, transparent);
}

.ext-callout__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text);
}

.ext-detail-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.ext-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--ui-text);
}

.ext-detail-key {
  color: var(--ui-text-muted);
}

.ext-detail-val--mono {
  font-family: var(--sp-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  word-break: break-all;
  text-align: right;
}

.ext-contrib-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ext-hooks-heading {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
}

.ext-hook-item {
  font-size: 13px;
  padding: 4px 0;
  color: var(--ui-text);
}

.ext-contrib-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  font-size: 12px;
  color: var(--ui-text);
}

.ext-contrib-name {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-contrib-meta {
  flex: 1;
  min-width: 0;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--sp-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.ext-contrib-status {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.ext-trust-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-warning-500, #f59e0b) 30%, var(--ui-border));
  background: color-mix(in srgb, var(--color-warning-500, #f59e0b) 6%, var(--ui-bg-elevated));
}

.ext-trust-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.ext-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 13px;
  padding: 16px;
}

.sp-action-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    opacity 0.12s,
    border-color 0.12s;
  border: 1.5px solid;
}

.sp-action-btn--cancel {
  background: transparent;
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
}

.sp-action-btn--cancel:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  border-color: var(--ui-text-muted);
}

.sp-action-btn--confirm {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-700);
  border-color: var(--color-primary-500);
}

.sp-action-btn--confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary-500) 24%, transparent);
}

:global(html.dark .sp-action-btn--confirm) {
  color: var(--color-primary-300);
  border-color: var(--color-primary-400);
}
</style>
