<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.xai }}</div>
    <LlmProviderSetupCard provider="xai" />
  </section>
</template>

<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import LlmProviderSetupCard from './LlmProviderSetupCard.vue'
import './sp-shared.css'

const { t } = useI18n()
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
