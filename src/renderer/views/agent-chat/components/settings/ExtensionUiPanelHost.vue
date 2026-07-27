<template>
  <section class="ext-ui-panel">
    <h3 class="ext-ui-panel__title">{{ panel.label }}</h3>
    <p class="ext-ui-panel__meta">
      {{ panel.extensionId }} · {{ panel.component }}
    </p>
    <p class="ext-ui-panel__hint">
      Extension UI panels are registered at runtime. Bundle the Vue component at
      <code>{{ panel.component }}</code> inside the extension directory and register it in the
      renderer panel map when shipping a first-party extension.
    </p>
  </section>
</template>

<script setup lang="ts">
import type { ExtensionUiPanelSummary } from '@shared/agent/extension-contributions'

defineProps<{
  panel: ExtensionUiPanelSummary
}>()
</script>

<style scoped>
.ext-ui-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px 16px;
}

.ext-ui-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-text);
}

.ext-ui-panel__meta {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.ext-ui-panel__hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.ext-ui-panel__hint code {
  font-size: 12px;
}
</style>
