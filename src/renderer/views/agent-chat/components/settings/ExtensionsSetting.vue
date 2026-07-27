<template>
  <div class="ext-layout">
    <aside class="ext-sidebar">
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
    </aside>

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
            @change="agentStore.toggleExtensionEnabled(selectedExtension!.id)"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': selectedExtension.enabled }"
          />
        </label>
      </div>

      <div class="ext-content-body">
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

        <div v-if="selectedExtension.hookEvents.length > 0" class="ext-hooks-list">
          <p class="ext-hooks-heading">{{ p.extensions.contributedHooks }}</p>
          <div
            v-for="event in selectedExtension.hookEvents"
            :key="event"
            class="ext-hook-item"
          >
            {{ event }}
          </div>
        </div>

        <div v-if="pendingForSelected.length > 0" class="ext-hooks-list">
          <p class="ext-hooks-heading">{{ p.extensions.pendingHooks }}</p>
          <div
            v-for="review in pendingForSelected"
            :key="review.trustKey"
            class="ext-trust-card"
          >
            <div class="ext-hook-item">{{ review.sourcePath }}</div>
            <div class="ext-hook-item ext-detail-val--mono">
              {{ review.events.join(', ') }}
            </div>
            <div class="ext-trust-actions">
              <button type="button" class="ext-trust-btn" @click="approveReview(review)">
                {{ p.extensions.approveHooks }}
              </button>
              <button
                type="button"
                class="ext-trust-btn ext-trust-btn--reject"
                @click="rejectReview(review)"
              >
                {{ p.extensions.rejectHooks }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="permissionEntries.length > 0" class="ext-hooks-list">
          <p class="ext-hooks-heading">{{ p.extensions.permissions }}</p>
          <div
            v-for="entry in permissionEntries"
            :key="entry.label"
            class="ext-hook-item"
          >
            {{ entry.label }}: {{ entry.value }}
          </div>
        </div>
        <div v-if="selectedUiPanels.length > 0" class="ext-ui-panels">
          <p class="ext-hooks-heading">UI panels</p>
          <ExtensionUiPanelHost
            v-for="panel in selectedUiPanels"
            :key="panel.registryId"
            :panel="panel"
          />
        </div>
      </div>
    </section>

    <section v-else class="ext-content ext-empty">
      <span>{{ p.extensions.empty }}</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import type { ExtensionSummary } from '@store/agent/types'
import type { PendingHookReview } from '@store/agent/agent-extensions'
import type { ExtensionUiPanelSummary } from '@shared/agent/extension-contributions'
import { DEFAULT_USER_ID } from '@store/agent/config'
import ExtensionUiPanelHost from './ExtensionUiPanelHost.vue'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)
const agentStore = useAgentStore()

const selectedId = ref<string | null>(null)
const pendingReviews = ref<PendingHookReview[]>([])
const extensionUiPanels = ref<ExtensionUiPanelSummary[]>([])

const selectedUiPanels = computed(() =>
  extensionUiPanels.value.filter(
    (panel) => panel.extensionId === selectedExtension.value?.id,
  ),
)

const selectedExtension = computed<ExtensionSummary | null>(
  () => agentStore.extensions.find((ext) => ext.id === selectedId.value) ?? null,
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

async function refreshExtensionUiPanels(): Promise<void> {
  const channel = window.ipcRendererChannel?.ListExtensionUiPanels
  if (!channel?.invoke) {
    extensionUiPanels.value = []
    return
  }
  const list = (await channel.invoke({ userId: DEFAULT_USER_ID })) as
    | ExtensionUiPanelSummary[]
    | undefined
  extensionUiPanels.value = Array.isArray(list) ? list : []
}

watch(selectedId, () => {
  void refreshExtensionUiPanels()
})

async function approveReview(review: PendingHookReview): Promise<void> {
  await agentStore.setHookTrustStatus(review, 'trusted')
  await refreshPendingReviews()
}

async function rejectReview(review: PendingHookReview): Promise<void> {
  await agentStore.setHookTrustStatus(review, 'rejected')
  await refreshPendingReviews()
}

onMounted(() => {
  void agentStore.loadExtensions().then(() => {
    if (agentStore.extensions.length > 0) {
      selectedId.value = agentStore.extensions[0]!.id
    }
    void refreshPendingReviews()
    void refreshExtensionUiPanels()
  })
})
</script>

<style scoped>
@import './sp-shared.css';

.ext-layout {
  display: flex;
  height: 100%;
  min-height: 0;
}

.ext-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  padding-right: 12px;
  border-right: 1px solid var(--sp-border, rgba(0, 0, 0, 0.08));
}

.ext-sidebar-empty {
  padding: 12px 8px;
  font-size: 13px;
  opacity: 0.6;
}

.ext-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
}

.ext-tab:hover {
  background: var(--sp-hover-bg, rgba(0, 0, 0, 0.04));
}

.ext-tab--active {
  background: var(--sp-active-bg, rgba(0, 0, 0, 0.06));
}

.ext-tab--disabled {
  opacity: 0.55;
}

.ext-tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ext-tab-dot--on {
  background: #2ea043;
}

.ext-tab-dot--off {
  background: #8a8a8a;
}

.ext-tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-tab-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  opacity: 0.75;
}

.ext-tab-badge--bundled {
  background: rgba(100, 100, 255, 0.12);
}

.ext-tab-badge--user {
  background: rgba(46, 160, 67, 0.12);
}

.ext-tab-badge--project {
  background: rgba(255, 165, 0, 0.12);
}

.ext-tab-badge--pending {
  background: rgba(220, 80, 80, 0.15);
}

.ext-content {
  flex: 1;
  min-width: 0;
  padding-left: 16px;
  overflow-y: auto;
}

.ext-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ext-section-title {
  font-size: 15px;
  font-weight: 600;
}

.ext-detail-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--sp-card-bg, rgba(0, 0, 0, 0.03));
}

.ext-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.ext-detail-key {
  opacity: 0.65;
}

.ext-detail-val--mono {
  font-family: var(--sp-mono-font, monospace);
  word-break: break-all;
}

.ext-hooks-list {
  margin-top: 16px;
}

.ext-hooks-heading {
  font-size: 12px;
  opacity: 0.65;
  margin-bottom: 6px;
}

.ext-hook-item {
  font-size: 13px;
  padding: 4px 0;
}

.ext-trust-card {
  padding: 8px 0 12px;
  border-bottom: 1px solid var(--sp-border, rgba(0, 0, 0, 0.08));
}

.ext-trust-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.ext-trust-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--sp-border, rgba(0, 0, 0, 0.12));
  background: var(--sp-card-bg, rgba(0, 0, 0, 0.03));
  cursor: pointer;
}

.ext-trust-btn--reject {
  opacity: 0.8;
}

.ext-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  font-size: 13px;
}
</style>
