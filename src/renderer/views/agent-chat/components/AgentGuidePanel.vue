<template>
  <div class="agent-guide" role="region" aria-label="Choose an agent">
    <h2 class="agent-guide__title">{{ t.agentGuide.title }}</h2>
    <p class="agent-guide__subtitle">{{ t.agentGuide.subtitle }}</p>

    <div class="agent-guide__grid">
      <button
        v-for="agent in agents"
        :key="agent.id"
        type="button"
        class="agent-guide__tile"
        :class="{ 'agent-guide__tile--selected': agent.id === selectedAgentId }"
        @click="emit('select-agent', agent.id)"
      >
        <UAvatar :alt="agent.name" :color="agent.color" size="md" />
        <span class="agent-guide__tile-name">{{ agent.name }}</span>
        <span v-if="agent.description" class="agent-guide__tile-desc">
          {{ agent.description }}
        </span>
        <span
          v-if="agent.id === selectedAgentId"
          class="agent-guide__tile-badge"
        >
          {{ t.agentGuide.selected }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import type { Agent } from '@store/agent'

defineProps<{
  agents: Agent[]
  selectedAgentId: string | null
}>()

const emit = defineEmits<{
  'select-agent': [agentId: string]
}>()

const { t } = useI18n()
</script>

<style scoped>
.agent-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: min(520px, 100%);
  padding: 32px 24px 48px;
  text-align: center;
  box-sizing: border-box;
}

.agent-guide__title {
  margin: 0 0 8px;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ui-text);
}

.agent-guide__subtitle {
  margin: 0 0 28px;
  max-width: 36rem;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}

.agent-guide__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  width: min(920px, 100%);
  justify-items: center;
}

.agent-guide__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  max-width: 220px;
  min-height: 168px;
  padding: 20px 16px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--ui-bg-elevated, var(--ui-bg)) 92%, transparent);
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition:
    border-color 0.15s,
    transform 0.15s,
    box-shadow 0.15s,
    background 0.15s;
}

.agent-guide__tile:hover {
  border-color: color-mix(in srgb, var(--color-primary-500) 45%, var(--ui-border));
  background: color-mix(in srgb, var(--color-primary-500) 5%, var(--ui-bg));
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.08);
}

.agent-guide__tile--selected {
  border-color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 8%, var(--ui-bg));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 18%, transparent);
}

.agent-guide__tile-name {
  font-size: 15px;
  font-weight: 650;
  color: var(--ui-text);
  line-height: 1.3;
}

.agent-guide__tile-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.agent-guide__tile-badge {
  margin-top: auto;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary-700, var(--color-primary-600));
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
}

@media (max-width: 640px) {
  .agent-guide__grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .agent-guide__tile {
    min-height: 150px;
    padding: 16px 12px 12px;
  }
}
</style>
