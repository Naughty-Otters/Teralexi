<template>
  <article class="li-bubble">
    <ul class="li-bubble__root">
      <li class="li-bubble__root-item li-bubble__root-item--title">
        <UIcon
          name="i-lucide-list-checks"
          class="li-bubble__icon"
          aria-hidden="true"
        />
        <span>{{ data.title }}</span>
      </li>

      <li v-if="data.finalGoal" class="li-bubble__root-item">
        <span class="li-bubble__item-key">Final goal:</span>
        <span>{{ data.finalGoal }}</span>
      </li>

      <li v-if="data.expectations.length > 0" class="li-bubble__root-item">
        <span class="li-bubble__item-key">Success expectations:</span>
        <ul class="li-bubble__nested">
          <li v-for="(item, idx) in data.expectations" :key="`exp-${idx}`">
            <span class="li-bubble__expect-item">{{ item }}</span>
          </li>
        </ul>
      </li>

      <li class="li-bubble__root-item">
        <span class="li-bubble__item-key">Todo items:</span>
        <TransitionGroup
          tag="ul"
          name="li-bubble-item"
          class="li-bubble__nested"
        >
          <li
            v-for="item in visibleItems"
            :key="item.id"
            class="li-bubble__todo-item"
          >
            <div class="li-bubble__item-main">
              <span class="li-bubble__item-title">
                {{ item.id }}. {{ item.title }}
              </span>
              <span v-if="item.description" class="li-bubble__item-desc">
                {{ item.description }}
              </span>
            </div>
            <ul v-if="item.details.length > 0" class="li-bubble__details">
              <li
                v-for="(detail, i) in item.details"
                :key="`${item.id}-d-${i}`"
              >
                <span
                  class="li-bubble__detail-tag"
                  :class="`li-bubble__detail-tag--${parsedDetail(detail).kind}`"
                >
                  {{ parsedDetail(detail).label }}
                </span>
                <span class="li-bubble__detail-text">
                  {{ parsedDetail(detail).text }}
                </span>
              </li>
            </ul>
          </li>
        </TransitionGroup>
        <button
          v-if="hasOverflow"
          type="button"
          class="li-bubble__toggle"
          :aria-expanded="showAllItems"
          @click="toggleExpanded"
        >
          <span>
            {{
              showAllItems
                ? 'Show fewer items'
                : `Show ${hiddenCount} more items`
            }}
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="li-bubble__toggle-chevron"
            :class="{ 'li-bubble__toggle-chevron--expanded': showAllItems }"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AssistantListBubbleData } from './chat/assistantBubbleFramework'

const expandedStateByKey = new Map<string, boolean>()

type DetailKind = 'success' | 'fallback' | 'docs' | 'scripts' | 'note'

type ParsedDetail = {
  kind: DetailKind
  label: string
  text: string
}

function parsedDetail(line: string): ParsedDetail {
  const normalized = line.trim().replace(/^[-*]\s*/, '')

  const success = normalized.match(/^(✓\s*)?Success:\s*(.+)$/i)
  if (success) {
    return { kind: 'success', label: 'Success', text: success[2].trim() }
  }

  const fallback = normalized.match(/^(↩\s*)?Fallback:\s*(.+)$/i)
  if (fallback) {
    return { kind: 'fallback', label: 'Fallback', text: fallback[2].trim() }
  }

  const docs = normalized.match(/^(📎\s*)?Ref docs?:\s*(.+)$/i)
  if (docs) {
    return { kind: 'docs', label: 'Ref docs', text: docs[2].trim() }
  }

  const scripts = normalized.match(/^(📎\s*)?Ref scripts?:\s*(.+)$/i)
  if (scripts) {
    return { kind: 'scripts', label: 'Ref scripts', text: scripts[2].trim() }
  }

  return {
    kind: 'note',
    label: 'Note',
    text: normalized.replace(/^(✓|↩|📎)\s*/, '').trim() || normalized,
  }
}

const props = defineProps<{
  data: AssistantListBubbleData
  stateKey?: string
}>()

const COMPACT_TODO_LIMIT = 3
const showAllItems = ref(false)

const hasOverflow = computed(() => props.data.items.length > COMPACT_TODO_LIMIT)
const hiddenCount = computed(() =>
  Math.max(0, props.data.items.length - COMPACT_TODO_LIMIT),
)
const visibleItems = computed(() =>
  showAllItems.value
    ? props.data.items
    : props.data.items.slice(0, COMPACT_TODO_LIMIT),
)

function applyPersistedState(): void {
  const key = props.stateKey?.trim()
  if (!key) {
    showAllItems.value = false
    return
  }
  showAllItems.value = expandedStateByKey.get(key) ?? false
}

function toggleExpanded(): void {
  showAllItems.value = !showAllItems.value
  const key = props.stateKey?.trim()
  if (!key) return
  expandedStateByKey.set(key, showAllItems.value)
}

watch(
  () => props.stateKey,
  () => {
    applyPersistedState()
  },
  { immediate: true },
)

watch(hasOverflow, (overflow) => {
  if (overflow) return
  showAllItems.value = false
  const key = props.stateKey?.trim()
  if (key) expandedStateByKey.set(key, false)
})
</script>

<style scoped>
.li-bubble {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  padding: 10px 12px;
}
.li-bubble__root {
  margin: 0;
  padding-left: 18px;
}
.li-bubble__root-item {
  margin: 6px 0;
}
.li-bubble__root-item--title {
  list-style: none;
  margin-left: -16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
.li-bubble__icon {
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted);
}
.li-bubble__item-key {
  font-weight: 600;
}
.li-bubble__nested {
  margin: 5px 0 0;
  padding-left: 16px;
}
.li-bubble__expect-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid
    color-mix(in srgb, var(--color-primary-500, #6366f1) 30%, var(--ui-border));
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 8%,
    var(--ui-bg)
  );
  margin: 3px 0;
}
.li-bubble__todo-item {
  margin: 7px 0;
  list-style: none;
  padding: 8px 9px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-bg) 92%, var(--ui-bg-elevated, #fff));
}
.li-bubble__item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.li-bubble__item-title {
  font-weight: 600;
}
.li-bubble__item-desc {
  white-space: pre-wrap;
}
.li-bubble__details {
  margin: 5px 0 0;
  padding-left: 0;
  color: var(--ui-text-muted);
  list-style: none;
}
.li-bubble__details li {
  margin: 5px 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  line-height: 1.45;
}
.li-bubble__detail-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: var(--app-font-family);
}
.li-bubble__detail-tag--success {
  border-color: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 55%,
    var(--ui-border)
  );
  color: var(--color-success-600, #16a34a);
}
.li-bubble__detail-tag--fallback {
  border-color: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 55%,
    var(--ui-border)
  );
  color: var(--color-warning-700, #b45309);
}
.li-bubble__detail-tag--docs,
.li-bubble__detail-tag--scripts {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 55%,
    var(--ui-border)
  );
  color: var(--color-primary-700, #4338ca);
}
.li-bubble__detail-text {
  font-family: var(--app-font-family);
  color: var(--ui-text-muted);
}
.li-bubble__toggle {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg) 80%, var(--ui-bg-elevated, #fff));
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
}
.li-bubble__toggle:hover {
  color: var(--ui-text);
  background: var(--ui-bg-accented, var(--ui-bg));
}
.li-bubble__toggle-chevron {
  width: 14px;
  height: 14px;
  transition: transform 0.16s ease;
}
.li-bubble__toggle-chevron--expanded {
  transform: rotate(180deg);
}

.li-bubble-item-enter-active,
.li-bubble-item-leave-active {
  transition: opacity 0.18s ease;
}
.li-bubble-item-enter-from,
.li-bubble-item-leave-to {
  opacity: 0;
}
</style>
