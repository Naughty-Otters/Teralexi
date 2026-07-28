<template>
  <section v-if="provider" class="sp-section">
    <div class="sp-section-title">{{ provider.label }}</div>
    <div class="ext-card">
      <div class="ext-row">
        <span class="ext-key">Registry id</span>
        <code class="ext-val">{{ provider.registryId }}</code>
      </div>
      <div class="ext-row">
        <span class="ext-key">Extension</span>
        <span class="ext-val">{{ provider.extensionId }}</span>
      </div>
      <div v-if="provider.credentialFields.length > 0" class="ext-row ext-row--stack">
        <span class="ext-key">Credential fields</span>
        <span class="ext-val">{{ provider.credentialFields.join(', ') }}</span>
      </div>
      <p class="ext-hint">
        Extension LLM providers are registered at runtime from trusted
        <code>actions/index.ts</code> exports. Credential storage for extension
        providers is not wired to this panel yet — configure the adapter in the
        extension source.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ExtensionLlmProviderSummary } from '@shared/agent/extension-contributions'
import './sp-shared.css'

defineProps<{
  provider: ExtensionLlmProviderSummary
}>()
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
.ext-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-subtle, var(--ui-bg));
}
.ext-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.ext-row--stack {
  flex-direction: column;
  align-items: flex-start;
}
.ext-key {
  color: var(--ui-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ext-val {
  color: var(--ui-text);
  word-break: break-all;
}
.ext-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.ext-hint code {
  font-size: 11px;
}
</style>
