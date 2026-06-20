<template>
  <div class="chat-header">
    <div class="chat-header-center">
      <div class="chat-header-center-heading">
        <span
          v-if="contextUsage"
          class="chat-header-context-ring"
          :class="{
            'chat-header-context-ring--warn': contextUsage.atCapacity,
            'chat-header-context-ring--over': contextUsage.overCapacity,
          }"
          :title="contextTitle"
          role="progressbar"
          :aria-valuenow="contextUsage.used"
          :aria-valuemin="0"
          :aria-valuemax="contextUsage.capacity"
          :aria-label="`Context window ${contextUsage.used} of ${contextUsage.capacity} messages`"
        >
          <svg
            class="chat-header-context-ring__svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              class="chat-header-context-ring__track"
              cx="12"
              cy="12"
              :r="RING_RADIUS"
            />
            <circle
              class="chat-header-context-ring__fill"
              cx="12"
              cy="12"
              :r="RING_RADIUS"
              :stroke-dasharray="RING_CIRCUMFERENCE"
              :stroke-dashoffset="contextRingOffset"
            />
          </svg>
          <span class="chat-header-context-ring__label" aria-hidden="true">
            {{ contextUsage.used }}
          </span>
        </span>
        <UAvatar :alt="activeAgentName" :color="activeAgentColor" size="sm" />
        <p class="chat-header-agent-name">{{ activeAgentName }}</p>
      </div>
      <p class="chat-header-center-meta">
        <span class="status-dot" :class="{ 'status-dot--streaming': isBusy }" />
        <span v-if="isBusy">Generating…</span>
        <span v-else>{{ activeAgentModel }}</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ContextWindowUsage } from '@shared/agent/context-window-usage'

const RING_RADIUS = 10
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const props = defineProps<{
  activeAgentName: string
  activeAgentModel: string
  activeAgentColor: string
  isBusy: boolean
  contextUsage?: ContextWindowUsage | null
}>()

const contextTitle = computed(() => {
  const usage = props.contextUsage
  if (!usage) return ''
  if (usage.overCapacity) {
    return `Context exceeds capacity (${usage.used}/${usage.capacity}). Older messages are compacted automatically before each run.`
  }
  if (usage.atCapacity) {
    return `Context window is full (${usage.used}/${usage.capacity}). Older messages will compact on the next run.`
  }
  return `Agent context window: ${usage.used} of ${usage.capacity} messages`
})

const contextRingOffset = computed(() => {
  const usage = props.contextUsage
  if (!usage) return RING_CIRCUMFERENCE
  return RING_CIRCUMFERENCE * (1 - usage.fillRatio)
})
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: var(--agent-header-min-height, 64px);
  padding: var(--agent-header-padding-y, 10px) var(--agent-header-padding-x, 20px);
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-border);
}

.chat-header-center {
  width: min(520px, 100%);
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.chat-header-center-heading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  max-width: 100%;
  min-width: 0;
}

.chat-header-context-ring {
  position: relative;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-header-context-ring__svg {
  width: 22px;
  height: 22px;
  transform: rotate(-90deg);
}

.chat-header-context-ring__track,
.chat-header-context-ring__fill {
  fill: none;
  stroke-width: 2.5;
}

.chat-header-context-ring__track {
  stroke: color-mix(in srgb, var(--ui-border) 85%, transparent);
}

.chat-header-context-ring__fill {
  stroke: var(--color-primary-500, #6366f1);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.2s ease, stroke 0.2s ease;
}

.chat-header-context-ring--warn .chat-header-context-ring__fill {
  stroke: var(--color-warning-500, #f59e0b);
}

.chat-header-context-ring--over .chat-header-context-ring__fill {
  stroke: var(--color-error-500, #ef4444);
}

.chat-header-context-ring__label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--ui-text-muted);
  pointer-events: none;
}

.chat-header-context-ring--warn .chat-header-context-ring__label,
.chat-header-context-ring--over .chat-header-context-ring__label {
  color: var(--ui-text);
}

.chat-header-agent-name {
  margin: 0;
  font-weight: 600;
  min-width: 0;
  max-width: min(360px, 68vw);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header-center-meta {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted, #64748b);
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  max-width: 100%;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-border);
}

.status-dot--streaming {
  background: var(--ui-primary);
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
