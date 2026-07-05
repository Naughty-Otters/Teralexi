<template>
  <div
    class="aft-card agent-configurations"
    :class="{ 'aft-card--disabled': disabled }"
  >
    <p class="agent-configurations__intro">{{ intro }}</p>

    <AgentSystemPropertiesFields
      v-if="hasSystemProperties"
      :fields="settings.fields.value"
      :loading="settings.loading.value"
      :loading-label="t.common.loading"
      :saving-key="settings.savingKey.value"
      :error="settings.error.value"
      :disabled="disabled"
      @update-field="settings.setDraft"
      @persist="onPersist"
    />

    <p
      v-if="showGoogleWorkspaceRedirectHint"
      class="agent-configurations__redirect-hint"
    >
      {{ p.googleWorkspace.redirectUriHint }}
    </p>

    <GoogleWorkspaceAuthPanel
      v-if="showGoogleWorkspaceAuth"
      :disabled="disabled"
      :system-properties="systemProperties"
      :property-values="settings.valuesByKey.value"
    />

    <p
      v-if="!hasSystemProperties && !showGoogleWorkspaceAuth"
      class="agent-configurations__empty"
    >
      {{ p.agents.configurationsEmpty }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentSystemPropertiesSettings } from '@renderer/composables/useAgentSystemPropertiesSettings'
import { skillIsGoogleWorkspaceAgent } from '@shared/agent/google-workspace-agent'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'
import AgentSystemPropertiesFields from './AgentSystemPropertiesFields.vue'
import GoogleWorkspaceAuthPanel from './GoogleWorkspaceAuthPanel.vue'
import './sp-shared.css'

const props = defineProps<{
  systemProperties?: readonly SkillSystemPropertySpec[]
  skillId?: string | null
  disabled?: boolean
}>()

const { t, p } = useI18n()
const settings = useAgentSystemPropertiesSettings(
  computed(() => props.systemProperties ?? []),
)

const hasSystemProperties = computed(
  () => (props.systemProperties?.length ?? 0) > 0,
)
const showGoogleWorkspaceAuth = computed(() =>
  skillIsGoogleWorkspaceAgent(props.skillId),
)
const showGoogleWorkspaceRedirectHint = computed(
  () => showGoogleWorkspaceAuth.value && hasSystemProperties.value,
)

const intro = computed(() => {
  if (showGoogleWorkspaceAuth.value) return p.value.googleWorkspace.intro
  return p.value.agents.configurationsIntro
})

async function onPersist(key: string) {
  await settings.persist(key)
}
</script>

<style scoped>
.agent-configurations__intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.agent-configurations__redirect-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.agent-configurations__empty {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted);
}
</style>
