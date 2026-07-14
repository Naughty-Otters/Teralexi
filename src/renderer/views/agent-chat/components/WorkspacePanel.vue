<template>
  <div
    class="workspace-panel"
    :class="{ 'workspace-panel--split': layout === 'split' }"
  >
    <div class="wp-header">
      <button
        v-if="layout === 'page'"
        class="wp-back"
        title="Back to chat"
        aria-label="Back to chat"
        @click="emit('close')"
      >
        <UIcon name="i-lucide-arrow-left" style="width: 15px; height: 15px" />
      </button>
      <button
        v-else
        class="wp-back"
        title="Close workspace panel"
        aria-label="Close workspace panel"
        @click="emit('close')"
      >
        <UIcon name="i-lucide-x" style="width: 15px; height: 15px" />
      </button>
      <div class="wp-title">
        <UIcon
          name="i-lucide-folder-open"
          style="width: 14px; height: 14px; flex-shrink: 0"
        />
        <span class="wp-title-name">{{ workspaceLabel }}</span>
      </div>
      <div class="wp-tabs" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          role="tab"
          class="wp-tab"
          :class="{ 'wp-tab--active': activeTab === tab.id }"
          @click="setTab(tab.id)"
        >
          <UIcon :name="tab.icon" class="wp-tab-icon" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="wp-body">
      <div v-if="!conversationId" class="wp-empty">
        <UIcon name="i-lucide-folder-x" class="wp-empty-icon" />
        <p>No conversation selected.</p>
        <p class="wp-empty-hint">
          Open a chat to browse sandbox or workspace files.
        </p>
      </div>

      <div
        v-else-if="activeTab === 'files'"
        class="wp-files-layout"
      >
        <div
          ref="filesLayoutEl"
          class="wp-files-main"
          :class="{ 'wp-files-main--resizing': fileBrowserResizing }"
        >
          <aside
            class="wp-files-browser"
            :style="{ width: `${fileBrowserWidthPx}px` }"
          >
            <WorkspaceFileTree
              @refresh="onRefreshFiles"
              @toggle-console="gitStore.toggleConsole()"
            />
          </aside>
          <PanelResizeHandle
            placement="after-start"
            :active="fileBrowserResizing"
            aria-label="Resize file browser"
            @pointerdown="onFileBrowserResizePointerDown"
            @keyboard-resize="onFileBrowserKeyboardResize"
          />
          <section class="wp-files-editor">
            <WorkspaceFileEditor />
          </section>
        </div>
        <WorkspaceXtermConsole
          v-if="consoleOpen"
          class="wp-workspace-terminal"
        />
      </div>

      <template v-else-if="activeTab === 'git'">
        <div v-if="!activeWorkspacePath" class="wp-empty">
          <UIcon name="i-lucide-git-branch" class="wp-empty-icon" />
          <p>Git is available when a workspace folder is set.</p>
          <p class="wp-empty-hint">
            Use the folder icon in the composer to attach a project folder.
          </p>
        </div>
        <div v-else class="wp-git-layout">
          <div class="wp-git-sidebar">
            <WorkspaceGitStatus
              @refresh="onRefreshGit"
              @show-diff="onShowDiff"
              @stage-all="onStageAll"
              @stage-files="onStageFiles"
              @push="onPush"
            />
            <WorkspaceGitLog @refresh="onRefreshLog" />
          </div>
          <div class="wp-git-diff">
            <div v-if="!diff && !diffLoading" class="wp-diff-empty">
              <UIcon name="i-lucide-diff" class="wp-diff-empty-icon" />
              <p>Click a file in the status panel to view its diff.</p>
            </div>
            <div v-else-if="diffLoading" class="wp-diff-loading">
              Loading diff…
            </div>
            <div v-else-if="diffError" class="wp-diff-error">
              {{ diffError }}
            </div>
            <div v-else class="wp-diff-content">
              <div class="wp-diff-toolbar">
                <span class="wp-diff-label">
                  {{ diffStaged ? 'Staged diff' : 'Unstaged diff' }}
                </span>
                <span v-if="diffFiles.length" class="wp-diff-files">
                  {{ diffFiles.join(', ') }}
                </span>
              </div>
              <div class="wp-diff-body">
                <ShikiDiffView :diff="diff" :file-path="diffFiles[0]" fill />
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, defineAsyncComponent } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@store/workspace'
import { useWorkspaceGitStore } from '@store/workspace-git'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import { useHorizontalPanelResize } from '@renderer/composables/useHorizontalPanelResize'
import { useWorkspaceLiveSync } from '@renderer/composables/useWorkspaceLiveSync'

const PanelResizeHandle = defineAsyncComponent(
  () => import('@renderer/components/PanelResizeHandle.vue'),
)
const ShikiDiffView = defineAsyncComponent(
  () => import('@renderer/components/code/ShikiDiffView.vue'),
)
const WorkspaceGitStatus = defineAsyncComponent(
  () => import('./workspace/WorkspaceGitStatus.vue'),
)
const WorkspaceGitLog = defineAsyncComponent(
  () => import('./workspace/WorkspaceGitLog.vue'),
)
const WorkspaceFileTree = defineAsyncComponent(
  () => import('./workspace/WorkspaceFileTree.vue'),
)
const WorkspaceFileEditor = defineAsyncComponent(
  () => import('./workspace/WorkspaceFileEditor.vue'),
)
const WorkspaceXtermConsole = defineAsyncComponent(
  () => import('./workspace/WorkspaceXtermConsole.vue'),
)

withDefaults(defineProps<{ layout?: 'page' | 'split' }>(), { layout: 'page' })
const emit = defineEmits<{ close: [] }>()

const workspaceStore = useWorkspaceStore()
const gitStore = useWorkspaceGitStore()
const navStore = useWorkspaceNavigationStore()

const { activeWorkspacePath, activeLabel, conversationId } =
  storeToRefs(workspaceStore)
const { tab: navTab, highlightPath } = storeToRefs(navStore)
const { diff, diffLoading, diffError, diffStaged, diffFiles, consoleOpen } =
  storeToRefs(gitStore)

const workspaceLabel = computed(() => activeLabel.value)

/** Changes when workspace folder vs sandbox root changes — restarts file watch. */
const filesRootKey = computed(
  () => activeWorkspacePath.value?.trim() || '__sandbox__',
)

useWorkspaceLiveSync(() => conversationId.value, () => filesRootKey.value)

const TABS = [
  { id: 'files' as const, label: 'Files', icon: 'i-lucide-files' },
  { id: 'git' as const, label: 'Git', icon: 'i-lucide-git-branch' },
] as const

type TabId = (typeof TABS)[number]['id']
const activeTab = ref<TabId>(navStore.getWorkspacePanelTab(conversationId.value))

watch(conversationId, (cid) => {
  activeTab.value = navStore.getWorkspacePanelTab(cid)
})

const filesLayoutEl = ref<HTMLElement | null>(null)
const fileBrowserResizeEnabled = computed(
  () => Boolean(conversationId.value) && activeTab.value === 'files',
)

const {
  sizePx: fileBrowserWidthPx,
  isResizing: fileBrowserResizing,
  onResizePointerDown: onFileBrowserResizePointerDown,
  setSize: setFileBrowserWidth,
} = useHorizontalPanelResize({
  containerRef: filesLayoutEl,
  panelSide: 'start',
  defaultSize: 220,
  minSize: 160,
  maxSize: { fraction: 0.58 },
  storageKey: 'teralexi.agent.workspaceFileBrowserWidth',
  enabled: fileBrowserResizeEnabled,
})

function onFileBrowserKeyboardResize(delta: number) {
  setFileBrowserWidth(fileBrowserWidthPx.value + delta)
}

function setTab(id: TabId) {
  activeTab.value = id
  const cid = conversationId.value?.trim()
  if (cid) navStore.setWorkspacePanelTab(cid, id)
  if (id === 'files') onRefreshFiles()
  if (id === 'git') onRefreshGit()
}

watch(
  [activeWorkspacePath, () => workspaceStore.conversationId],
  ([path, convId], [prevPath, prevConvId]) => {
    gitStore.setWorkspace(path ?? null, convId ?? null)
    if (!convId) return
    if (path) {
      void gitStore.refreshWorkspaceView({ includeLog: true })
      return
    }
    if (prevConvId !== convId) {
      activeTab.value = navStore.getWorkspacePanelTab(convId)
    } else {
      activeTab.value = navStore.getWorkspacePanelTab(convId)
    }
    void gitStore.refreshWorkspaceView()
  },
  { immediate: true },
)

function onRefreshGit() {
  void gitStore.refreshWorkspaceView()
}

function onRefreshLog() {
  void gitStore.refreshLog()
}

function onRefreshFiles() {
  void gitStore.refreshWorkspaceView()
}

function onShowDiff(opts: { staged: boolean; files?: string[] }) {
  void gitStore.refreshDiff(opts.staged, opts.files ?? [])
}

async function onStageAll() {
  await gitStore.stageAll()
}

async function onStageFiles(files: string[]) {
  await gitStore.stageFiles(files)
}

async function onPush() {
  await gitStore.push()
}

watch(highlightPath, (path) => {
  if (!path?.trim()) return
  const tab = navTab.value
  if (tab === 'files' || tab === 'git') {
    activeTab.value = tab
    if (tab === 'files') {
      void gitStore.navigateFilesToHighlight(path)
      void gitStore.openFileInEditor(path)
    }
    if (tab === 'git') onRefreshGit()
  }
  if (activeTab.value === 'git') {
    void gitStore.refreshDiff(false, [path])
  }
})

onMounted(() => {
  if (!workspaceStore.conversationId) return
  if (activeWorkspacePath.value) void gitStore.refreshWorkspaceView({ includeLog: true })
  else void gitStore.refreshWorkspaceView()
})
</script>

<style scoped>
.workspace-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-bg);
  overflow: hidden;
  font-family: var(--app-font-family);
  font-size: var(--app-font-size);
}

.workspace-panel--split {
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-border);
}

.wp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--ui-border);
  flex-shrink: 0;
  flex-wrap: nowrap;
  min-width: 0;
}

.wp-back {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--ui-text-muted);
  border-radius: 6px;
  padding: 4px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.wp-back:hover {
  color: var(--ui-text);
  background: var(--ui-bg-elevated);
}

.wp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--app-font-size);
  font-weight: 600;
  color: var(--ui-text);
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.wp-title-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wp-tabs {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  margin-left: auto;
}

.wp-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: var(--app-font-size);
  font-weight: 500;
  color: var(--ui-text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.12s;
  white-space: nowrap;
}

.wp-tab:hover {
  color: var(--ui-text);
}

.wp-tab--active {
  color: var(--color-primary-500, #6366f1);
  border-bottom-color: var(--color-primary-500, #6366f1);
}

.wp-tab-icon {
  width: 13px;
  height: 13px;
}

.wp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  padding: 24px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: var(--app-font-size);
}

.wp-empty-icon {
  width: 36px;
  height: 36px;
  opacity: 0.35;
}

.wp-empty-hint {
  font-size: var(--app-font-size-secondary);
  opacity: 0.7;
}

.wp-files-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wp-files-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  overflow: hidden;
}

.wp-files-main--resizing {
  cursor: col-resize;
  user-select: none;
}

.wp-files-main--resizing .wp-files-editor {
  pointer-events: none;
}

.wp-files-browser {
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg);
}

.wp-files-browser :deep(.file-tree) {
  height: 100%;
  min-height: 0;
}

.wp-files-editor {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.wp-workspace-terminal {
  flex-shrink: 0;
  width: 100%;
  min-height: 200px;
  max-height: min(40%, 360px);
}

.wp-git-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wp-git-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.wp-git-diff {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wp-diff-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  color: var(--ui-text-muted);
  font-size: var(--app-font-size-secondary);
  text-align: center;
  padding: 24px;
}

.wp-diff-empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.3;
}

.wp-diff-loading,
.wp-diff-error {
  padding: 12px;
  font-size: var(--app-font-size-secondary);
  color: var(--ui-text-muted);
}

.wp-diff-error {
  color: var(--color-error-600, #dc2626);
}

.wp-diff-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wp-diff-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  font-size: var(--app-font-size-sm);
  flex-shrink: 0;
}

.wp-diff-label {
  font-weight: 600;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wp-diff-files {
  color: var(--ui-text);
  font-family: var(--app-font-family);
}

.wp-diff-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
</style>
