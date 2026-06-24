<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ meta.label }}</div>
    <LlmProviderSetupCard :provider="provider" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  openAiCompatibleProviderMeta,
  type OpenAiCompatibleProviderId,
} from '@shared/agent/llm-provider-registry'
import LlmProviderSetupCard from './LlmProviderSetupCard.vue'
import './sp-shared.css'

const props = defineProps<{
  provider: OpenAiCompatibleProviderId
}>()

const meta = computed(() => openAiCompatibleProviderMeta(props.provider))
</script>

<style scoped>
.sp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sp-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
}
</style>
