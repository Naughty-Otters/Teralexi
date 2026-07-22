<template>
  <div class="explore-tool-row" :data-running="running || undefined">
    <UIcon
      :name="running ? 'i-lucide-loader-circle' : 'i-lucide-check'"
      class="explore-tool-row__icon"
      :class="{ 'explore-tool-row__icon--spin': running }"
      aria-hidden="true"
    />
    <span class="explore-tool-row__kind">{{ kindLabel }}</span>
    <span class="explore-tool-row__detail" :title="detail">{{ detail }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { shellExploreRowLabel } from '@shared/agent/explore-activity-summary'
import {
  formatToolHumanReadableAction,
} from '@shared/tool-result/tool-human-readable'
import {
  getToolPartInput,
  getToolPartState,
  isRunningState,
  toolPartDisplayName,
} from './chat/chatToolPartHelpers'

const props = defineProps<{
  part: unknown
}>()

const toolName = computed(() => toolPartDisplayName(props.part))
const input = computed(() => getToolPartInput(props.part))
const running = computed(() => isRunningState(getToolPartState(props.part)))

const kindLabel = computed(() => {
  const name = toolName.value
  if (name === 'read_file') return 'Read'
  if (name === 'lsp') return 'LSP'
  if (name === 'shell' || name === 'run_workspace_command') {
    const shell = shellExploreRowLabel(
      (input.value as { command?: unknown } | null)?.command ?? input.value,
    )
    return shell?.kind ?? 'Shell'
  }
  if (name === 'web_search') return 'Search'
  if (name === 'web_scrape') return 'Scrape'
  return name
})

const detail = computed(() => {
  const name = toolName.value
  const inp = input.value
  if (name === 'shell' || name === 'run_workspace_command') {
    const shell = shellExploreRowLabel(
      (inp as { command?: unknown } | null)?.command ?? inp,
    )
    if (shell?.detail) return shell.detail
  }
  return formatToolHumanReadableAction(name, inp)
})
</script>

<style scoped>
.explore-tool-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--ui-text-muted, #6b7280);
  min-width: 0;
}

.explore-tool-row__icon {
  flex: 0 0 auto;
  width: 0.85rem;
  height: 0.85rem;
  margin-top: 0.1rem;
}

.explore-tool-row__icon--spin {
  animation: explore-spin 0.8s linear infinite;
}

@keyframes explore-spin {
  to {
    transform: rotate(360deg);
  }
}

.explore-tool-row__kind {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--ui-text, #111827);
}

.explore-tool-row__detail {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
