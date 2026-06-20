<template>
  <form class="chat-composer" @submit.prevent="emit('submit')">
    <BackgroundTaskPanel
      v-if="codingAgent && backgroundTasks.length > 0"
      :tasks="backgroundTasks"
      @cancel="emit('cancel-background-task', $event)"
    />
    <CodingModeBar
      v-if="showCodingModeBar"
      :active-mode="codingMode"
      :disabled="workspaceDisabled"
      @update:active-mode="emit('update:codingMode', $event)"
    />
    <p
      v-if="planStatusHint"
      class="composer-plan-mode-hint"
      role="status"
    >
      {{ planStatusHint }}
    </p>
    <WorkspacePathBanner :disabled="workspaceDisabled" />
    <div class="composer-shell">
      <RichMessageComposer
        :model-value="modelValue"
        :selected-agent-id="selectedAgentId"
        :agent-options="agentOptions"
        :conversation-id="conversationId"
        :workspace-disabled="workspaceDisabled"
        :coding-agent="codingAgent"
        :sub-agent-targets="subAgentTargets"
        :sub-agent-mention-enabled="subAgentMentionEnabled"
        placeholder="Message…"
        @update:model-value="emit('update:modelValue', $event)"
        @select-agent="emit('select-agent', $event)"
        @submit="onComposerSubmit"
      />
      <button
        type="submit"
        class="composer-send cp-icon-btn cp-icon-btn--compact"
        :disabled="sendDisabled"
        aria-label="Send message"
        title="Send message"
      >
        <UIcon class="cp-icon-btn__glyph" name="i-lucide-arrow-up" />
      </button>
    </div>
    <p v-if="workspaceHint" class="composer-workspace-hint">{{ workspaceHint }}</p>
    <p
      v-if="googleWorkspaceHint"
      class="composer-workspace-hint"
      role="alert"
    >
      {{ googleWorkspaceHint }}
    </p>
    <p
      v-if="githubHint"
      class="composer-workspace-hint"
      role="alert"
    >
      {{ githubHint }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CodingMode } from '@shared/agent/coding-mode'
import {
  planModeComposerHint,
  type PlanModeDisplayStatus,
} from '@shared/agent/plan-mode-phase'
import type { SubAgentTarget } from '@shared/agent/sub-agent-targets'
import RichMessageComposer from './RichMessageComposer.vue'
import CodingModeBar from './CodingModeBar.vue'
import WorkspacePathBanner from './WorkspacePathBanner.vue'
import BackgroundTaskPanel, {
  type BackgroundTaskView,
} from './BackgroundTaskPanel.vue'

const props = defineProps<{
  modelValue: string
  /** Disables only the send button (input stays editable). */
  sendDisabled: boolean
  selectedAgentId: string | null
  agentOptions: Array<{ id: string; name: string }>
  conversationId?: string | null
  workspaceDisabled?: boolean
  workspaceHint?: string | null
  googleWorkspaceHint?: string | null
  githubHint?: string | null
  showCodingModeBar?: boolean
  codingAgent?: boolean
  codingMode?: CodingMode
  planDisplayStatus?: PlanModeDisplayStatus
  backgroundTasks?: BackgroundTaskView[]
  subAgentTargets?: SubAgentTarget[]
  subAgentMentionEnabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [v: string]
  'update:codingMode': [mode: CodingMode]
  'select-agent': [agentId: string]
  'cancel-background-task': [taskId: string]
  submit: []
}>()

const codingMode = computed(() => props.codingMode ?? 'normal')
const codingAgent = computed(() => props.codingAgent === true)
const backgroundTasks = computed(() => props.backgroundTasks ?? [])
const showCodingModeBar = computed(() => props.showCodingModeBar === true)
const subAgentTargets = computed(() => props.subAgentTargets ?? [])
const subAgentMentionEnabled = computed(() => props.subAgentMentionEnabled === true)

const planStatusHint = computed(() =>
  planModeComposerHint(props.planDisplayStatus ?? 'tool_execute'),
)

function onComposerSubmit() {
  if (props.sendDisabled) return
  emit('submit')
}
</script>

<style scoped>
.chat-composer {
  padding: 12px;
  border-top: 1px solid var(--ui-border);
  flex-shrink: 0;
}
.composer-shell {
  position: relative;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-bg-elevated);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ui-text) 6%, transparent);
  transition:
    border-color 0.14s ease,
    box-shadow 0.14s ease,
    background-color 0.14s ease;
}
.composer-shell:focus-within {
  border-color: color-mix(in srgb, var(--color-primary-500) 46%, var(--ui-border));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-primary-500) 14%, transparent),
    0 6px 18px color-mix(in srgb, var(--color-primary-500) 10%, transparent);
}
.composer-shell :deep(.rich-composer) {
  position: relative;
  z-index: 0;
}
.composer-workspace-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-warning-600, #d97706);
  line-height: 1.4;
}
.composer-plan-mode-hint {
  margin: 0 0 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-primary) 20%, transparent);
  color: var(--ui-text);
}
.composer-send {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 1;
}
.chat-composer:has(.rich-composer--agent-picker-open) {
  position: relative;
  z-index: 30;
}

.composer-shell:has(.rich-composer--picker-open) .composer-send {
  z-index: 0;
}
.composer-send:disabled {
  opacity: 0.45;
}
</style>
