<template>
  <section v-if="channel" class="sp-section">
    <div class="sp-section-title">{{ channelLabel }}</div>
    <div class="ext-card">
      <div class="ext-row">
        <span class="ext-key">Registry id</span>
        <code class="ext-val">{{ channel.registryId }}</code>
      </div>
      <div class="ext-row">
        <span class="ext-key">Extension</span>
        <span class="ext-val">{{ channel.extensionId }}</span>
      </div>
      <div class="ext-row">
        <span class="ext-key">Channel id</span>
        <span class="ext-val">{{ channel.channelId }}</span>
      </div>
      <p class="ext-hint">
        Extension channels register in <code>ChannelRegistry</code> when the
        extension's <code>actions/index.ts</code> is trusted. Use the registry id
        (e.g. in scheduler outbound targets) to send messages through this channel.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ExtensionChannelSummary } from '@shared/agent/extension-contributions'
import './sp-shared.css'

const props = defineProps<{
  channel: ExtensionChannelSummary
}>()

const channelLabel = computed(
  () => `${props.channel.extensionId} / ${props.channel.channelId}`,
)
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
