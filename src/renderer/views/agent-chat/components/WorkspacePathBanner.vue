<template>
  <div
    v-if="showBanner"
    class="composer-workspace-banner"
    role="status"
  >
    <UIcon
      name="i-lucide-folder-open"
      class="composer-workspace-banner__icon"
      aria-hidden="true"
    />
    <span
      class="composer-workspace-banner__path"
      :title="displayPath"
    >
      {{ displayPath }}
    </span>
    <button
      type="button"
      class="composer-workspace-banner__dismiss"
      :disabled="disabled"
      :title="dismissTitle"
      aria-label="Remove workspace folder"
      @click="onDismiss"
    >
      <UIcon name="i-lucide-x" class="composer-workspace-banner__dismiss-icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  useWorkspaceComposerShortcuts,
} from '@renderer/composables/useWorkspaceComposerShortcuts'
import { useWorkspaceStore } from '@store/workspace'

const props = defineProps<{
  disabled?: boolean
}>()

const workspaceStore = useWorkspaceStore()
const { clearShortcutLabel } = useWorkspaceComposerShortcuts()
const { isWorkspaceActive, activeWorkspacePath, pendingWorkspacePath, hasPendingWorkspace } =
  storeToRefs(workspaceStore)

const showBanner = computed(
  () => isWorkspaceActive.value && Boolean(displayPath.value?.trim()),
)

const displayPath = computed(
  () => activeWorkspacePath.value ?? pendingWorkspacePath.value ?? '',
)

const dismissTitle = computed(() => {
  const base = hasPendingWorkspace.value
    ? 'Remove workspace folder for your next conversation'
    : 'Remove workspace folder — revert to sandbox'
  return `${base} (${clearShortcutLabel.value} in message box)`
})

async function onDismiss() {
  if (props.disabled) return
  await workspaceStore.clearWorkspace()
}
</script>

<style scoped>
.composer-workspace-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 6px 8px 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-primary) 20%, transparent);
  color: var(--ui-text);
  min-width: 0;
}

.composer-workspace-banner__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted);
}

.composer-workspace-banner__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-font-family);
  font-size: 11px;
}

.composer-workspace-banner__dismiss {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.composer-workspace-banner__dismiss:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  color: var(--ui-text);
}

.composer-workspace-banner__dismiss:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.composer-workspace-banner__dismiss-icon {
  width: 14px;
  height: 14px;
}
</style>
