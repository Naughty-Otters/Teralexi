<template>
  <div
    class="workspace-selector"
    :class="{ 'workspace-selector--toolbar': variant === 'toolbar' }"
  >
    <button
      type="button"
      class="workspace-btn workspace-btn--pick"
      :class="{
        'workspace-btn--icon-only': variant === 'toolbar',
        'workspace-btn--active': variant === 'toolbar' && isWorkspaceActive,
      }"
      :disabled="isDisabled"
      :title="effectivePickTitle"
      :aria-label="pickAriaLabel"
      @mousedown.prevent
      @click="onPickFolder"
    >
      <UIcon
        :name="isWorkspaceActive ? 'i-lucide-folder-open' : 'i-lucide-folder'"
        class="workspace-icon"
        aria-hidden="true"
      />
      <span v-if="variant !== 'toolbar'" class="workspace-label">{{ buttonLabel }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  WORKSPACE_CHANGE_SHORTCUT,
  useWorkspaceComposerShortcuts,
} from '@renderer/composables/useWorkspaceComposerShortcuts'
import { useWorkspaceStore } from '@store/workspace'
import { useAgentStore } from '@store/agent'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    variant?: 'default' | 'toolbar'
  }>(),
  {
    variant: 'default',
  },
)

const agentStore = useAgentStore()
const workspaceStore = useWorkspaceStore()
const { changeShortcutLabel } = useWorkspaceComposerShortcuts()
const {
  isWorkspaceActive,
  activeWorkspacePath,
  activeLabel,
  lastError,
  hasPendingWorkspace,
} = storeToRefs(workspaceStore)

const isDisabled = computed(() => Boolean(props.disabled))

const hasConversation = computed(() =>
  Boolean(agentStore.currentConversationId?.trim()),
)

const buttonLabel = computed(() =>
  isWorkspaceActive.value ? activeLabel.value : 'Select folder…',
)

const pickAriaLabel = computed(() => {
  if (isWorkspaceActive.value) {
    return `Workspace: ${activeLabel.value}. Click to change folder.`
  }
  return hasConversation.value
    ? 'Set workspace folder for this conversation'
    : 'Set workspace folder for your next conversation'
})

const pickButtonTitle = computed(() => {
  if (props.disabled) {
    return 'Workspace cannot be changed while the agent is running'
  }
  if (isWorkspaceActive.value) {
    if (hasPendingWorkspace.value) {
      return `Workspace for next conversation: ${activeWorkspacePath.value ?? ''}`
    }
    return `Workspace folder: ${activeWorkspacePath.value ?? ''}`
  }
  if (!hasConversation.value) {
    return 'Choose a folder on disk; it applies when you start a new conversation or send your first message'
  }
  return 'Choose a folder on disk for this conversation (tools use it instead of the sandbox)'
})

const effectivePickTitle = computed(() => {
  const base = pickButtonTitle.value
  const hint = isWorkspaceActive.value
    ? `\n\nShortcut: ${changeShortcutLabel.value}`
    : ''
  const err = lastError.value ? `\n\n${lastError.value}` : ''
  return `${base}${hint}${err}`
})

defineShortcuts({
  [WORKSPACE_CHANGE_SHORTCUT]: {
    handler: () => {
      if (isDisabled.value) return
      void onPickFolder()
    },
    usingInput: true,
  },
})

async function onPickFolder() {
  if (isDisabled.value) return
  await workspaceStore.selectAndSetWorkspace()
}
</script>

<style scoped>
.workspace-selector {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.workspace-selector--toolbar {
  flex-wrap: nowrap;
  gap: 2px;
  flex-shrink: 0;
}

.workspace-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg, transparent);
  color: var(--ui-text-muted, #64748b);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  min-width: 0;
}

.workspace-selector--toolbar .workspace-btn {
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
}

.workspace-btn--icon-only {
  width: 28px;
  padding: 0;
  justify-content: center;
  max-width: none;
}

.workspace-btn--with-label {
  width: auto;
  max-width: none;
  padding: 0 8px;
  gap: 5px;
}

.workspace-selector--toolbar .workspace-btn--pick.workspace-btn--with-label {
  max-width: min(140px, 30vw);
}

.workspace-btn--icon-only.workspace-btn--active {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-500, var(--ui-text));
}

.workspace-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-btn:hover:not(:disabled) {
  background: var(--ui-bg-elevated, rgba(0, 0, 0, 0.05));
  color: var(--ui-text);
  border-color: var(--ui-border-strong, var(--ui-border));
}

.workspace-selector--toolbar .workspace-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
  border-color: transparent;
}

.workspace-btn--pick {
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
}

.workspace-btn--clear {
  flex-shrink: 0;
  padding: 6px 8px;
}

.workspace-selector--toolbar .workspace-btn--clear {
  width: 28px;
  padding: 0;
  justify-content: center;
}

.workspace-toolbar-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: var(--ui-text-muted);
}

.workspace-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.workspace-icon {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.workspace-selector--toolbar .workspace-icon {
  width: 16px;
  height: 16px;
}

.workspace-icon--clear {
  width: 13px;
  height: 13px;
}
</style>
