<template>
  <div
    v-if="!IsUseSysTitle && !IsWeb"
    class="window-title"
    :class="{
      'window-title--mac': isMac,
      'window-title--windows': isWindows,
    }"
  >
    <div class="window-title__left">
      <div v-if="chatControls.visible" class="chat-title-controls chat-title-controls--left">
        <button
          type="button"
          class="cp-icon-btn"
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
      </div>
    </div>
    <div
      v-if="
        chatControls.title
          || chatControls.activeAgentName
          || chatControls.activeAgentModel
          || workspaceInlineLabel
      "
      style="-webkit-app-region: drag"
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
    <div v-if="chatControls.visible && chatControls.showChatActions" class="chat-title-controls chat-title-controls--right">
      <button
        type="button"
        class="cp-icon-btn"
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
      <button
        type="button"
        class="cp-icon-btn"
        title="Stop"
        :disabled="!chatControls.isBusy"
        @click="chatControls.onStop?.()"
      >
        <UIcon class="cp-icon-btn__glyph" name="i-lucide-square" />
      </button>
      <button
        type="button"
        class="cp-icon-btn"
        title="Clear conversation"
        @click="chatControls.onClearConversation?.()"
      >
        <UIcon class="cp-icon-btn__glyph" name="i-lucide-trash-2" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useTitleBarChatControls } from '@renderer/composables/useTitleBarChatControls'
import { useWorkspaceStore } from '@renderer/store/modules/workspace'
const { ipcRendererChannel, systemInfo } = window

const IsUseSysTitle = ref(false)
const IsWeb = ref(Boolean(__ISWEB__))
const chatControls = useTitleBarChatControls()
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

ipcRendererChannel.IsUseSysTitle.invoke().then((res) => {
  IsUseSysTitle.value = res
})
</script>

<style lang="scss" scoped>
.window-title {
  width: 100%;
  height: 30px;
  line-height: 30px;
  background-color: var(--ui-bg-elevated);
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  position: fixed;
  top: 0;
  z-index: 99999;
  padding: 0 12px;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  .window-title__left {
    display: flex;
    align-items: center;
    min-width: fit-content;
    height: 100%;
  }

  .window-title__center {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(720px, calc(100% - 320px));
    min-width: 0;
    max-width: min(74vw, 800px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    line-height: 1;
    pointer-events: none;
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

  .chat-title-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    -webkit-app-region: no-drag;
  }

  .chat-title-controls :deep(.cp-icon-btn) {
    min-width: 28px;
    min-height: 28px;
    padding: 0 7px;
    border-radius: 8px;
    box-shadow: none;
  }

  .chat-title-controls :deep(.cp-icon-btn__glyph) {
    width: 15px;
    height: 15px;
  }

  .chat-title-controls :deep(.cp-icon-btn:hover:not(:disabled)) {
    box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  }

  .chat-title-controls :deep(.cp-icon-btn:focus-visible) {
    box-shadow:
      0 0 0 2px var(--ui-bg, #fff),
      0 0 0 4px color-mix(in srgb, var(--color-primary-500) 24%, transparent);
  }

  .chat-title-controls--right {
    margin-left: auto;
  }
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
</style>
