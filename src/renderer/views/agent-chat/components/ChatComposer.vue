<template>
  <form class="chat-composer" @submit.prevent="emit('submit')">
    <template v-if="!loading">
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
      <div
        v-if="showPlanStatusHint"
        class="composer-plan-mode-hint"
        role="status"
      >
        <span class="composer-plan-mode-hint__text">{{ planStatusHint }}</span>
        <button
          type="button"
          class="composer-plan-mode-hint__dismiss"
          title="Dismiss"
          aria-label="Dismiss plan status"
          @click="dismissPlanStatusHint"
        >
          <UIcon
            name="i-lucide-x"
            class="composer-plan-mode-hint__dismiss-icon"
          />
        </button>
      </div>
      <WorkspacePathBanner :disabled="workspaceDisabled" />
      <SkillSystemPropertiesForm
        v-if="skillSetup?.needsSetup"
        :title="skillSetup.title"
        :intro="skillSetup.intro"
        :loading-label="skillSetup.loadingLabel"
        :save-label="skillSetup.saveLabel"
        :saving-label="skillSetup.savingLabel"
        :fields="skillSetup.fields"
        :loading="skillSetup.loading"
        :saving="skillSetup.saving"
        :can-save="skillSetup.canSave"
        :error="skillSetup.error"
        @update-field="skillSetup.onUpdateField"
        @save="skillSetup.onSave"
      />
    </template>
    <div class="composer-shell">
      <ComposerSkeleton v-if="loading" />
      <RichMessageComposer
        v-else
        :model-value="modelValue"
        :selected-agent-id="selectedAgentId"
        :agent-options="agentOptions"
        :chat-agents="chatAgents"
        :conversation-id="conversationId"
        :skill-id="skillId"
        :workspace-disabled="workspaceDisabled"
        :coding-agent="codingAgent"
        :sub-agent-slash-enabled="subAgentSlashEnabled"
        :staged-attachments="stagedAttachments"
        :can-add-attachments="canAddAttachments"
        :llm-override="llmOverride"
        :agent-provider="agentProvider"
        :agent-model="agentModel"
        :signed-in="signedIn"
        :locked-agent-title="lockedAgentTitle"
        placeholder="Message…"
        @update:model-value="emit('update:modelValue', $event)"
        @update:llm-override="emit('update:llmOverride', $event)"
        @select-agent="emit('select-agent', $event)"
        @sign-in-required="emit('sign-in-required')"
        @pick-attachments="emit('pick-attachments')"
        @remove-attachment="emit('remove-attachment', $event)"
        @add-attachment-paths="emit('add-attachment-paths', $event)"
        @submit="onComposerSubmit"
      />
      <AppIconTooltip text="Send message">
        <button
          type="submit"
          class="composer-send cp-icon-btn cp-icon-btn--compact"
          :disabled="sendDisabled || loading"
          aria-label="Send message"
        >
          <UIcon class="cp-icon-btn__glyph" name="i-lucide-arrow-up" />
        </button>
      </AppIconTooltip>
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
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import type { CodingMode } from '@shared/agent/coding-mode'
import type { ConversationLlmOverride } from '@shared/agent/conversation-llm-override'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import {
  planModeComposerHint,
  type PlanModeDisplayStatus,
} from '@shared/agent/plan-mode-phase'
import type { StagedChatAttachment } from '@renderer/composables/useChatAttachments'
import ComposerSkeleton from './ComposerSkeleton.vue'
import CodingModeBar from './CodingModeBar.vue'
import WorkspacePathBanner from './WorkspacePathBanner.vue'
import BackgroundTaskPanel, {
  type BackgroundTaskView,
} from './BackgroundTaskPanel.vue'
import SkillSystemPropertiesForm from './SkillSystemPropertiesForm.vue'
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'
import type { SkillSystemPropertyFieldView } from '@renderer/composables/useSkillSystemProperties'
import type { SkillGroupAgentRef } from '@shared/agent/skill-groups'

const RichMessageComposer = defineAsyncComponent({
  loader: () => import('./RichMessageComposer.vue'),
  loadingComponent: ComposerSkeleton,
  delay: 0,
})

export type ChatComposerSkillSetupState = {
  needsSetup: boolean
  title: string
  intro: string
  loadingLabel: string
  saveLabel: string
  savingLabel: string
  fields: SkillSystemPropertyFieldView[]
  loading: boolean
  saving: boolean
  canSave: boolean
  error: string | null
  onUpdateField: (key: string, value: string) => void
  onSave: () => void
}

const props = defineProps<{
  modelValue: string
  /** Shows a non-interactive skeleton while conversation/bootstrap is loading. */
  loading?: boolean
  /** Disables only the send button (input stays editable). */
  sendDisabled: boolean
  selectedAgentId: string | null
  agentOptions: Array<{ id: string; name: string }>
  chatAgents?: SkillGroupAgentRef[]
  conversationId?: string | null
  /** Active skill id for skill-owned composer toolbar plugins. */
  skillId?: string | null
  workspaceDisabled?: boolean
  workspaceHint?: string | null
  googleWorkspaceHint?: string | null
  githubHint?: string | null
  showCodingModeBar?: boolean
  codingAgent?: boolean
  codingMode?: CodingMode
  planDisplayStatus?: PlanModeDisplayStatus
  /** True while the active chat turn is submitted/streaming. */
  agentBusy?: boolean
  backgroundTasks?: BackgroundTaskView[]
  subAgentSlashEnabled?: boolean
  stagedAttachments?: StagedChatAttachment[]
  canAddAttachments?: boolean
  skillSetup?: ChatComposerSkillSetupState | null
  llmOverride?: ConversationLlmOverride | null
  agentProvider?: ProviderType
  agentModel?: string
  signedIn?: boolean
  lockedAgentTitle?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [v: string]
  'update:codingMode': [mode: CodingMode]
  'update:llmOverride': [value: ConversationLlmOverride | null]
  'select-agent': [agentId: string]
  'sign-in-required': []
  'cancel-background-task': [taskId: string]
  'pick-attachments': []
  'remove-attachment': [id: string]
  'add-attachment-paths': [paths: string[]]
  submit: []
}>()

const codingMode = computed(() => props.codingMode ?? 'normal')
const codingAgent = computed(() => props.codingAgent === true)
const backgroundTasks = computed(() => props.backgroundTasks ?? [])
const showCodingModeBar = computed(() => props.showCodingModeBar === true)
const subAgentSlashEnabled = computed(() => props.subAgentSlashEnabled === true)
const stagedAttachments = computed(() => props.stagedAttachments ?? [])
const canAddAttachments = computed(() => props.canAddAttachments !== false)
const llmOverride = computed(() => props.llmOverride ?? null)
const agentProvider = computed((): ProviderType => props.agentProvider ?? 'ollama')
const agentModel = computed(() => props.agentModel ?? '')
const signedIn = computed(() => props.signedIn !== false)
const lockedAgentTitle = computed(
  () => props.lockedAgentTitle ?? 'Sign in to use this agent',
)
const agentBusy = computed(() => props.agentBusy === true)
const planDisplayStatus = computed(
  () => props.planDisplayStatus ?? 'tool_execute',
)

const planStatusHint = computed(() =>
  planModeComposerHint(planDisplayStatus.value),
)

/** Manual dismiss for any plan-status banner. */
const planHintManuallyDismissed = ref(false)
/**
 * After a plan-execution turn ends, keep the execute banner hidden until the
 * next turn starts (status can remain `plan_tool_execute` between turns).
 */
const planExecuteHintTurnHidden = ref(
  planDisplayStatus.value === 'plan_tool_execute' && !agentBusy.value,
)

const showPlanStatusHint = computed(() => {
  if (!planStatusHint.value || planHintManuallyDismissed.value) return false
  if (
    planDisplayStatus.value === 'plan_tool_execute' &&
    planExecuteHintTurnHidden.value
  ) {
    return false
  }
  return true
})

watch(planDisplayStatus, (status, previous) => {
  if (status === previous) return
  planHintManuallyDismissed.value = false
  planExecuteHintTurnHidden.value =
    status === 'plan_tool_execute' && !agentBusy.value
})

watch(agentBusy, (busy, wasBusy) => {
  if (planDisplayStatus.value !== 'plan_tool_execute') return
  if (wasBusy === true && !busy) {
    planExecuteHintTurnHidden.value = true
    return
  }
  if (wasBusy === false && busy) {
    planExecuteHintTurnHidden.value = false
    planHintManuallyDismissed.value = false
  }
})

function dismissPlanStatusHint() {
  planHintManuallyDismissed.value = true
}

function onComposerSubmit() {
  if (props.loading || props.sendDisabled) return
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
}
.composer-plan-mode-hint__text {
  flex: 1;
  min-width: 0;
}
.composer-plan-mode-hint__dismiss {
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
  transition:
    background 0.12s,
    color 0.12s;
}
.composer-plan-mode-hint__dismiss:hover {
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  color: var(--ui-text);
}
.composer-plan-mode-hint__dismiss-icon {
  width: 14px;
  height: 14px;
}
.composer-send {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 1;
}
.chat-composer:has(.rich-composer--picker-open) {
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
