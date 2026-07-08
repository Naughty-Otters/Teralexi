<template>
  <div
    v-if="!IsUseSysTitle && !IsWeb"
    class="window-title"
    :class="{
      'window-title--mac': isMac,
      'window-title--windows': isWindows,
      'window-title--update-available': updateHighlight.kind === 'available',
      'window-title--update-downloading': updateHighlight.kind === 'downloading',
      'window-title--update-ready': updateHighlight.kind === 'ready',
    }"
  >
    <div class="window-title__left">
      <button
        v-if="chatControls.visible"
        type="button"
        class="cp-icon-btn window-title__btn"
        :class="{ 'cp-icon-btn--on': !chatControls.sidebarCollapsed }"
        title="Toggle conversation list"
        @click="chatControls.onToggleSidebar?.()"
      >
        <UIcon
          class="cp-icon-btn__glyph"
          :name="
            chatControls.sidebarCollapsed
              ? 'i-lucide-panel-left-open'
              : 'i-lucide-panel-left-close'
          "
        />
      </button>

      <button
        v-if="chatControls.visible"
        type="button"
        class="cp-icon-btn window-title__btn"
        :class="{ 'cp-icon-btn--on': chatControls.showWorkspacePanel }"
        :title="workspaceToggleTitle"
        :aria-label="workspaceToggleTitle"
        @click="chatControls.onToggleWorkspacePanel?.()"
      >
        <UIcon
          class="cp-icon-btn__glyph"
          :name="
            chatControls.showWorkspacePanel
              ? 'i-lucide-messages-square'
              : 'i-lucide-layout-list'
          "
        />
      </button>

      <button
        v-if="updateHighlight.visible"
        type="button"
        class="window-title__update-flag"
        :title="t.titleBar.openAbout"
        :aria-label="updateHighlight.label"
        @click="onUpdateFlagClick"
      >
        <UIcon class="window-title__update-flag-icon" name="i-lucide-arrow-up-circle" />
        <span class="window-title__update-flag-text">{{ updateHighlight.label }}</span>
      </button>
    </div>

    <div
      v-if="
        chatControls.title
          || chatControls.activeAgentName
          || chatControls.activeAgentModel
          || workspaceInlineLabel
      "
      class="window-title__center"
      :title="windowTitleLabel"
    >
      <span v-if="chatControls.title" class="window-title__title">
        {{ chatControls.title }}
      </span>
      <span
        v-if="chatControls.title && (chatControls.activeAgentName || chatControls.isBusy || chatControls.activeAgentModel)"
        class="window-title__center-sep"
      >
        ·
      </span>
      <span
        v-if="chatControls.activeAgentName || chatControls.isBusy || chatControls.activeAgentModel"
        class="window-title__meta"
      >
        <span
          class="window-title__status-dot"
          :class="{ 'window-title__status-dot--streaming': chatControls.isBusy }"
        />
        <template v-if="chatControls.isBusy">
          <span>Generating…</span>
        </template>
        <template v-else>
          <span v-if="chatControls.activeAgentName">{{ chatControls.activeAgentName }}</span>
          <span
            v-if="chatControls.activeAgentName && chatControls.activeAgentModel"
            class="window-title__center-sep"
          >
            ·
          </span>
          <span v-if="chatControls.activeAgentModel">{{ chatControls.activeAgentModel }}</span>
        </template>
      </span>
      <template v-if="workspaceInlineLabel">
        <span class="window-title__center-sep">·</span>
        <span class="window-title__workspace" :title="workspaceBarTitle">
          {{ workspaceInlineLabel }}
        </span>
      </template>
    </div>

    <div
      v-if="chatControls.visible && chatControls.showChatActions"
      class="window-title__actions"
    >
      <button
        type="button"
        class="cp-icon-btn window-title__btn window-title__btn--duplicate-session"
        title="New session with same agent and workspace"
        aria-label="New session with same agent and workspace"
        @click="chatControls.onNewSession?.()"
      >
        <UIcon class="cp-icon-btn__glyph" name="i-lucide-copy-plus" />
      </button>
      <button
        type="button"
        class="cp-icon-btn window-title__btn"
        title="Stop"
        :disabled="!chatControls.isBusy"
        @click="chatControls.onStop?.()"
      >
        <UIcon class="cp-icon-btn__glyph" name="i-lucide-square" />
      </button>
      <button
        type="button"
        class="cp-icon-btn window-title__btn"
        :class="{ 'cp-icon-btn--on': chatControls.showReportPanel }"
        :title="
          chatControls.showReportPanel ? 'Hide results panel' : 'Show results panel'
        "
        @click="chatControls.onToggleReportPanel?.()"
      >
        <UIcon
          class="cp-icon-btn__glyph"
          :name="
            chatControls.showReportPanel
              ? 'i-lucide-panel-right-close'
              : 'i-lucide-panel-right-open'
          "
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useTitleBarChatControls } from '@renderer/composables/useTitleBarChatControls'
import { useAppUpdate } from '@renderer/composables/useAppUpdate'
import { openAppUpdateAbout } from '@renderer/composables/useAppUpdateNavigation'
import { useI18n } from '@renderer/composables/useI18n'
import { useWorkspaceStore } from '@renderer/store/modules/workspace'
const { ipcRendererChannel, systemInfo } = window

const { t } = useI18n()
const IsUseSysTitle = ref(false)
const IsWeb = ref(Boolean(__ISWEB__))
const chatControls = useTitleBarChatControls()
const { state: appUpdateState } = useAppUpdate()
const workspaceStore = useWorkspaceStore()
const { activeWorkspacePath, pendingWorkspacePath } = storeToRefs(workspaceStore)
const isMac = systemInfo.platform === 'darwin'
const isWindows = systemInfo.platform === 'win32'

const workspacePathDisplay = computed((): string | null => {
  const path =
    activeWorkspacePath.value?.trim() || pendingWorkspacePath.value?.trim() || ''
  return path || null
})

const workspaceInlineLabel = computed((): string | null => {
  const path = workspacePathDisplay.value
  if (!path) return null
  return path
})

const workspaceToggleTitle = computed(() =>
  chatControls.showWorkspacePanel
    ? t.value.sidebar.backToConversation
    : t.value.sidebar.openWorkspace,
)

const workspaceBarTitle = computed(() => {
  const path = workspacePathDisplay.value
  if (!path) {
    return 'No project folder selected. Agent file tools use the conversation sandbox only.'
  }
  if (pendingWorkspacePath.value?.trim() && !activeWorkspacePath.value?.trim()) {
    return `Pending workspace (applies to next conversation): ${path}`
  }
  return `Workspace: ${path}`
})

const windowTitleLabel = computed(() => {
  const meta = chatControls.isBusy
    ? 'Generating…'
    : [chatControls.activeAgentName, chatControls.activeAgentModel].filter(Boolean).join(' · ')
  const workspace = workspacePathDisplay.value ?? 'sandbox only'

  return [chatControls.title, meta, workspace].filter(Boolean).join(' · ')
})

const updateHighlight = computed(() => {
  const version = appUpdateState.newVersion?.trim()
  const versionToken = version ? `v${version}` : 'v…'

  if (appUpdateState.phase === 'downloaded') {
    return {
      visible: true,
      kind: 'ready' as const,
      label: t.value.titleBar.updateReady.replace('{version}', versionToken),
    }
  }
  if (appUpdateState.phase === 'downloading') {
    const percent =
      appUpdateState.percent != null ? ` ${Math.round(appUpdateState.percent)}%` : ''
    return {
      visible: true,
      kind: 'downloading' as const,
      label: `${t.value.titleBar.updateDownloading.replace('{version}', versionToken)}${percent}`,
    }
  }
  if (appUpdateState.phase === 'available' && version) {
    return {
      visible: true,
      kind: 'available' as const,
      label: t.value.titleBar.updateAvailable.replace('{version}', versionToken),
    }
  }

  return {
    visible: false,
    kind: 'idle' as const,
    label: '',
  }
})

function onUpdateFlagClick() {
  openAppUpdateAbout()
}

ipcRendererChannel.IsUseSysTitle.invoke().then((res) => {
  IsUseSysTitle.value = res
})
</script>

<style lang="scss" scoped>
.window-title {
  --app-title-bar-height: 30px;

  width: 100%;
  height: var(--app-title-bar-height);
  line-height: var(--app-title-bar-height);
  background-color: var(--ui-bg-elevated);
  border-bottom: 1px solid color-mix(in srgb, var(--ui-text) 8%, transparent);
  display: flex;
  align-items: stretch;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100000;
  padding: 0 12px;
  box-sizing: border-box;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-app-region: drag;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.window-title__left,
.window-title__center,
.window-title__actions {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  height: 100%;
  min-height: 0;
}

.window-title__left {
  flex-shrink: 0;
  gap: 8px;
}

.window-title__update-flag {
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(34vw, 260px);
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-primary-500) 40%, var(--ui-border));
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  animation: title-bar-update-pulse 2.4s ease-in-out infinite;
}

.window-title__update-flag-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.window-title__update-flag-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-title__update-flag:hover {
  background: color-mix(in srgb, var(--color-primary-500) 22%, transparent);
}

.window-title--update-available,
.window-title--update-downloading {
  border-bottom-color: color-mix(in srgb, var(--color-primary-500) 55%, var(--ui-border));
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--color-primary-500) 65%, transparent);
}

.window-title--update-ready {
  border-bottom-color: color-mix(in srgb, var(--color-success-500, #22c55e) 55%, var(--ui-border));
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--color-success-500, #22c55e) 65%, transparent);
}

.window-title--update-ready .window-title__update-flag {
  border-color: color-mix(in srgb, var(--color-success-500, #22c55e) 45%, var(--ui-border));
  background: color-mix(in srgb, var(--color-success-500, #22c55e) 14%, transparent);
  color: var(--color-success-600, #16a34a);
}

.window-title--update-downloading .window-title__update-flag {
  animation: none;
}

.window-title__center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(720px, calc(100% - 320px));
  min-width: 0;
  max-width: min(74vw, 800px);
  justify-content: center;
  gap: 8px;
  text-align: center;
  line-height: 1;
}

.window-title__title {
  min-width: 0;
  max-width: min(38vw, 420px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.window-title__meta {
  min-width: 0;
  max-width: min(30vw, 300px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.window-title__meta > span:not(.window-title__status-dot):not(.window-title__center-sep) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-title__center-sep {
  flex-shrink: 0;
  color: var(--ui-text-muted);
  opacity: 0.65;
}

.window-title__workspace {
  min-width: 0;
  max-width: min(28vw, 280px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 500;
}

.window-title__status-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--ui-border);
}

.window-title__status-dot--streaming {
  background: var(--ui-primary);
  animation: title-bar-pulse 1.2s infinite;
}

.window-title__actions {
  margin-left: auto;
  flex-shrink: 0;
  gap: 6px;
}

.window-title__btn {
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 2;
}

.window-title :deep(.window-title__btn) {
  min-width: 28px;
  min-height: 28px;
  padding: 0 7px;
  border-radius: 8px;
  box-shadow: none;
}

.window-title :deep(.window-title__btn .cp-icon-btn__glyph) {
  width: 15px;
  height: 15px;
}

.window-title :deep(.window-title__btn:hover:not(:disabled)) {
  box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary-500) 10%, transparent);
}

.window-title :deep(.window-title__btn:focus-visible) {
  box-shadow:
    0 0 0 2px var(--ui-bg, #fff),
    0 0 0 4px color-mix(in srgb, var(--color-primary-500) 24%, transparent);
}

.window-title :deep(.window-title__btn--duplicate-session) {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
}

.window-title :deep(.window-title__btn--duplicate-session:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
}

.window-title--mac {
  padding-left: 82px;
}

.window-title--windows {
  padding-right: 148px;
}

@keyframes title-bar-pulse {
  50% {
    opacity: 0.45;
  }
}

@keyframes title-bar-update-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary-500) 28%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  }
}
</style>
