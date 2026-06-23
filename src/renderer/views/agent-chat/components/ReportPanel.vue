<template>
  <aside class="report-panel">
    <div
      v-if="hasTabs"
      class="report-panel-tabs"
      role="tablist"
      aria-label="Preview tabs"
    >
      <button
        v-for="run in sandboxRuns"
        :key="`run-${run.id}`"
        type="button"
        role="tab"
        class="cp-tab"
        :aria-selected="isSandboxRunActive(run.id)"
        :class="{ 'cp-tab--active': isSandboxRunActive(run.id) }"
        :title="run.label"
        @click="selectSandboxRun(run.id)"
      >
        <span class="cp-tab__label">{{ run.label }}</span>
      </button>
      <div
        v-for="tab in linkTabs"
        :key="tab.id"
        class="cp-tab-wrap"
        :class="{ 'cp-tab-wrap--active': isLinkTabActive(tab.id) }"
      >
        <button
          type="button"
          role="tab"
          class="cp-tab cp-tab--link"
          :aria-selected="isLinkTabActive(tab.id)"
          :class="{ 'cp-tab--active': isLinkTabActive(tab.id) }"
          :title="tab.url"
          @click="selectLinkTab(tab.id)"
        >
          <span class="cp-tab__label">{{ tab.label }}</span>
        </button>
        <button
          type="button"
          class="cp-tab__close"
          :aria-label="`Close ${tab.label}`"
          title="Close tab"
          @click="emit('close-link-tab', tab.id)"
        >
          <UIcon name="i-lucide-x" class="cp-tab__close-icon" />
        </button>
      </div>
    </div>

    <div class="report-panel-url-section">
      <div
        v-if="showMarkdownViewToggle"
        class="report-panel-view-toggle"
        role="group"
        aria-label="Markdown preview mode"
      >
        <button
          type="button"
          class="report-panel-view-btn"
          :class="{ 'report-panel-view-btn--active': markdownPreviewView === 'html' }"
          @click="markdownPreviewView = 'html'"
        >
          HTML
        </button>
        <button
          type="button"
          class="report-panel-view-btn"
          :class="{ 'report-panel-view-btn--active': markdownPreviewView === 'raw' }"
          @click="markdownPreviewView = 'raw'"
        >
          Raw
        </button>
      </div>
      <div class="report-panel-url-row">
        <input
          v-model="urlDraft"
          type="text"
          class="report-panel-url-input"
          spellcheck="false"
          autocomplete="off"
          placeholder="file://…"
          aria-label="Preview URL"
          @keydown.enter.prevent="applyPreviewUrl"
          @blur="applyPreviewUrl"
        />
        <button
          type="button"
          class="cp-icon-btn cp-icon-btn--compact"
          :disabled="!previewUrl"
          title="Copy URL"
          aria-label="Copy URL"
          @click="copyResultsUrl"
        >
          <UIcon name="i-lucide-copy" class="cp-icon-btn__glyph" />
        </button>
      </div>
    </div>

    <div
      ref="sandboxHostEl"
      class="report-panel-viewport"
    >
      <div
        v-if="!previewUrl"
        class="report-panel-placeholder"
      >
        <UIcon name="i-lucide-folder-open" class="report-panel-placeholder-icon" />
        <p>No sandbox preview yet</p>
        <span>Run the agent to attach <code>output/results</code>. The folder opens here.</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  withDefaults,
} from 'vue'
import type { ConversationSandboxRun } from '@store/agent/types'
import type { PreviewLinkTab } from '../report-preview-tabs'
import {
  isMarkdownPreviewFileUrl,
  type MarkdownPreviewViewMode,
} from '@shared/file-type/markdown-preview-url'

export type ReportPanelPreviewSource = 'sandbox-run' | 'link'

const props = withDefaults(
  defineProps<{
    sandboxRuns?: ConversationSandboxRun[]
    selectedRunId?: string | null
    linkTabs?: PreviewLinkTab[]
    activeLinkTabId?: string | null
    previewSource?: ReportPanelPreviewSource
  }>(),
  {
    sandboxRuns: () => [],
    selectedRunId: null,
    linkTabs: () => [],
    activeLinkTabId: null,
    previewSource: 'sandbox-run',
  },
)

const emit = defineEmits<{
  'update:selectedRunId': [id: string]
  'update:activeLinkTabId': [id: string | null]
  'update:previewSource': [source: ReportPanelPreviewSource]
  'close-link-tab': [tabId: string]
}>()

const sandboxHostEl = ref<HTMLElement | null>(null)
/** Editable URL field; synced from the active tab unless the user is typing. */
const urlDraft = ref('')
const markdownPreviewView = ref<MarkdownPreviewViewMode>('html')

const activeLinkTab = computed(() => {
  const id = props.activeLinkTabId
  if (!id) return null
  return props.linkTabs.find((tab) => tab.id === id) ?? null
})

const hasTabs = computed(
  () => (props.sandboxRuns?.length ?? 0) > 0 || (props.linkTabs?.length ?? 0) > 0,
)

function isLinkTabActive(tabId: string): boolean {
  return props.previewSource === 'link' && props.activeLinkTabId === tabId
}

function isSandboxRunActive(runId: string): boolean {
  return props.previewSource === 'sandbox-run' && activeRun.value?.id === runId
}

function selectLinkTab(tabId: string) {
  emit('update:previewSource', 'link')
  emit('update:activeLinkTabId', tabId)
}

function selectSandboxRun(runId: string) {
  emit('update:previewSource', 'sandbox-run')
  emit('update:selectedRunId', runId)
}

const activeRun = computed((): ConversationSandboxRun | null => {
  const runs = props.sandboxRuns ?? []
  if (!runs.length) return null
  const sel = props.selectedRunId
  if (sel) {
    const hit = runs.find((r) => r.id === sel)
    if (hit) return hit
  }
  return runs[runs.length - 1]
})

const activeResultsFileUrl = computed(() => {
  const u = activeRun.value?.resultsFileUrl?.trim()
  return u || null
})

const previewUrl = computed(() => {
  if (props.previewSource === 'link' && activeLinkTab.value?.url) {
    return activeLinkTab.value.url
  }
  const typed = urlDraft.value.trim()
  if (typed) return typed
  return activeResultsFileUrl.value
})

const showMarkdownViewToggle = computed(() =>
  isMarkdownPreviewFileUrl(previewUrl.value),
)

watch(
  () => [props.previewSource, activeLinkTab.value?.url] as const,
  ([source, url]) => {
    if (source === 'link' && url?.trim()) {
      urlDraft.value = url.trim()
    }
  },
  { immediate: true },
)

watch(
  () => [activeRun.value?.id, activeResultsFileUrl.value] as const,
  ([, url]) => {
    if (props.previewSource !== 'sandbox-run') return
    urlDraft.value = url ?? ''
  },
  { immediate: true },
)

function screenBoundsForEl(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(window.screenX + r.left),
    y: Math.round(window.screenY + r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  }
}

async function syncSandboxOutputBounds() {
  const ipc = window.ipcRendererChannel?.SyncSandboxOutputView
  if (!ipc?.invoke) return
  const host = sandboxHostEl.value
  if (!host) {
    await ipc.invoke({
      screenBounds: { x: 0, y: 0, width: 0, height: 0 },
      fileUrl: null,
    })
    return
  }
  await ipc.invoke({
    screenBounds: screenBoundsForEl(host),
    fileUrl: previewUrl.value,
    markdownView: markdownPreviewView.value,
  })
}

let boundsSyncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleBoundsSync(immediate = false) {
  if (immediate) {
    if (boundsSyncTimer) {
      clearTimeout(boundsSyncTimer)
      boundsSyncTimer = null
    }
    void syncSandboxOutputBounds()
    return
  }
  if (boundsSyncTimer) clearTimeout(boundsSyncTimer)
  boundsSyncTimer = setTimeout(() => {
    boundsSyncTimer = null
    void syncSandboxOutputBounds()
  }, 32)
}

async function clearSandboxOutputView() {
  const ipc = window.ipcRendererChannel?.SyncSandboxOutputView
  await ipc?.invoke?.({
    screenBounds: { x: 0, y: 0, width: 0, height: 0 },
    fileUrl: null,
  })
}

function copyResultsUrl() {
  const url = previewUrl.value
  if (!url || !navigator.clipboard?.writeText) return
  void navigator.clipboard.writeText(url)
}

async function applyPreviewUrl() {
  await nextTick()
  attachSandboxResizeObserver()
  scheduleBoundsSync(true)
}

let sandboxResizeObserver: ResizeObserver | null = null

function attachSandboxResizeObserver() {
  sandboxResizeObserver?.disconnect()
  sandboxResizeObserver = new ResizeObserver(() => {
    scheduleBoundsSync()
  })
  if (sandboxHostEl.value) {
    sandboxResizeObserver.observe(sandboxHostEl.value)
  }
}

function onWindowResize() {
  scheduleBoundsSync()
}

watch(
  [previewUrl, markdownPreviewView],
  async () => {
    await nextTick()
    attachSandboxResizeObserver()
    scheduleBoundsSync(true)
  },
  { flush: 'post' },
)

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  void nextTick(() => {
    attachSandboxResizeObserver()
    scheduleBoundsSync(true)
  })
})

onBeforeUnmount(() => {
  if (boundsSyncTimer) {
    clearTimeout(boundsSyncTimer)
    boundsSyncTimer = null
  }
  sandboxResizeObserver?.disconnect()
  window.removeEventListener('resize', onWindowResize)
  void clearSandboxOutputView()
})
</script>

<style scoped>
.report-panel {
  flex-shrink: 0;
  min-width: 280px;
  background: var(--ui-bg-elevated);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.report-panel-tabs {
  flex-shrink: 0;
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
  gap: 4px;
  padding: 10px 10px 0;
  overflow-x: auto;
  scrollbar-width: thin;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.cp-tab-wrap {
  display: inline-flex;
  align-items: stretch;
  flex-shrink: 0;
  max-width: min(220px, 42vw);
  border-radius: 9px 9px 0 0;
}

.cp-tab-wrap--active .cp-tab {
  color: var(--ui-text);
  background: var(--ui-bg);
  border-color: var(--ui-border);
  border-bottom-color: var(--ui-bg);
  margin-bottom: -1px;
  padding-bottom: 9px;
  box-shadow: 0 -1px 0 color-mix(in srgb, var(--ui-text) 5%, transparent);
}

.cp-tab__label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-tab--link {
  max-width: 100%;
  padding-right: 8px;
}

.cp-tab__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  margin-left: -4px;
  margin-bottom: 1px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.cp-tab-wrap--active .cp-tab__close {
  margin-bottom: 0;
}

.cp-tab__close:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.cp-tab__close-icon {
  width: 12px;
  height: 12px;
}

.report-panel-url-section {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-panel-view-toggle {
  display: inline-flex;
  align-self: flex-start;
  gap: 4px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.report-panel-view-btn {
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.report-panel-view-btn--active {
  color: var(--ui-text);
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px var(--ui-border);
}

.report-panel-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-panel-url-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.45;
  font-family: var(--app-font-family);
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}

.report-panel-url-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
}

.report-panel-viewport {
  flex: 1;
  min-height: 200px;
  position: relative;
  background: var(--ui-bg);
}

.report-panel-placeholder {
  height: 100%;
  min-height: 180px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.report-panel-placeholder p {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.report-panel-placeholder code {
  font-size: 11px;
}

.report-panel-placeholder-icon {
  width: 24px;
  height: 24px;
  opacity: 0.75;
}

@media (max-width: 960px) {
  .report-panel {
    width: 100%;
    min-width: 0;
    max-width: none;
    max-height: min(480px, 60vh);
    border-left: none;
    border-top: 1px solid var(--ui-border);
  }

  .report-panel-viewport {
    min-height: 220px;
  }
}
</style>
