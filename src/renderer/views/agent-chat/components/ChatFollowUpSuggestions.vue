<script setup lang="ts">
import { computed } from 'vue'
import { sortFollowUps, type FollowUpItem } from '@shared/agent/follow-up'

const props = defineProps<{
  items: FollowUpItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [item: FollowUpItem]
}>()

const sortedItems = computed(() => sortFollowUps(props.items))

/** Top-priority suggestion (lowest priority value, then stable id order). */
const recommendedId = computed(() => sortedItems.value[0]?.id ?? null)
</script>

<template>
  <div
    v-if="sortedItems.length > 0"
    class="chat-follow-ups"
    role="region"
    aria-label="Suggested follow-ups"
  >
    <p class="chat-follow-ups__title">Suggested next steps</p>
    <div class="chat-follow-ups__list">
      <button
        v-for="item in sortedItems"
        :key="item.id"
        type="button"
        class="chat-follow-ups__btn"
        :class="{ 'chat-follow-ups__btn--recommended': item.id === recommendedId }"
        :disabled="disabled"
        :title="item.label"
        @click="emit('select', item)"
      >
        <span class="chat-follow-ups__label">{{ item.label }}</span>
        <span
          v-if="item.id === recommendedId"
          class="chat-follow-ups__tag"
        >(recommend)</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-follow-ups {
  margin: 0.65rem 0 0.15rem;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--ui-border, #d4d4d8) 80%, transparent);
  background: color-mix(in srgb, var(--ui-bg, #fff) 92%, var(--ui-primary, #3b82f6) 8%);
}

.chat-follow-ups__title {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #71717a);
}

.chat-follow-ups__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chat-follow-ups__btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 100%;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border, #d4d4d8) 90%, transparent);
  background: var(--ui-bg, #fff);
  color: var(--ui-text, #18181b);
  font-size: 0.8125rem;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.chat-follow-ups__btn--recommended {
  border-color: color-mix(in srgb, var(--ui-primary, #3b82f6) 55%, transparent);
  background: color-mix(in srgb, var(--ui-bg, #fff) 82%, var(--ui-primary, #3b82f6) 18%);
}

.chat-follow-ups__btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-primary, #3b82f6) 45%, transparent);
  background: color-mix(in srgb, var(--ui-bg, #fff) 85%, var(--ui-primary, #3b82f6) 15%);
}

.chat-follow-ups__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-follow-ups__label {
  min-width: 0;
}

.chat-follow-ups__tag {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--ui-primary, #3b82f6) 85%, #000);
  opacity: 0.9;
}
</style>
