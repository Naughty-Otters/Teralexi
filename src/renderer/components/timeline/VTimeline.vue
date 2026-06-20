<template>
  <ul
    class="v-timeline"
    :class="{
      'v-timeline--outlined-default': defaultFill === 'outlined',
      [`v-timeline--align-${align}`]: true,
    }"
    :style="rootStyle"
  >
    <li
      v-for="(item, index) in items"
      :key="itemKey(item, index)"
      class="v-timeline__item"
      :class="{
        'v-timeline__item--active': isItemActive(item, index),
        'v-timeline__item--filled': itemFill(item) === 'filled',
        'v-timeline__item--outlined': itemFill(item) === 'outlined',
      }"
      role="button"
      tabindex="0"
      @click="onItemClick(item, index, $event)"
      @keydown.enter.prevent="onItemClick(item, index, $event)"
      @keydown.space.prevent="onItemClick(item, index, $event)"
    >
      <div class="v-timeline__tail" aria-hidden="true" />
      <div class="v-timeline__head" aria-hidden="true" />
      <div class="v-timeline__content">
        <slot name="item" :item="item" :index="index" :active="isItemActive(item, index)">
          <slot
            v-if="item.slotName"
            :name="item.slotName"
            :item="item"
            :index="index"
            :active="isItemActive(item, index)"
          >
            {{ item.label }}
          </slot>
          <span v-else class="v-timeline__label">{{ item.label }}</span>
        </slot>
        <div
          v-if="isItemActive(item, index)"
          class="v-timeline__detail"
          @click.stop
        >
          <slot
            name="item-detail"
            :item="item"
            :index="index"
            :active="true"
          />
        </div>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VTimelineItem, VTimelineItemFill } from './types'

const props = withDefaults(
  defineProps<{
    items: VTimelineItem[]
    /** Accent color for dots and connector line. */
    color?: string
    /** Default dot fill when an item omits `fill`. */
    defaultFill?: VTimelineItemFill
    align?: 'left' | 'right'
    modelValue?: string | number
  }>(),
  {
    color: '',
    defaultFill: 'filled',
    align: 'left',
    modelValue: undefined,
  },
)

const emit = defineEmits<{
  'item-click': [payload: { item: VTimelineItem; index: number; event: Event }]
  'update:modelValue': [value: string | number | undefined]
}>()

const accentColor = computed(
  () => props.color || 'var(--color-primary-500, #6366f1)',
)

const rootStyle = computed(() => ({
  '--v-timeline-color': accentColor.value,
}))

function itemKey(item: VTimelineItem, index: number): string {
  return item.id ?? `v-timeline-item-${index}`
}

function itemFill(item: VTimelineItem): VTimelineItemFill {
  return item.fill ?? props.defaultFill
}

function itemValue(item: VTimelineItem, index: number): string | number {
  return item.id ?? index
}

function isItemActive(item: VTimelineItem, index: number): boolean {
  if (props.modelValue === undefined) return false
  return props.modelValue === itemValue(item, index)
}

function onItemClick(item: VTimelineItem, index: number, event: Event) {
  const value = itemValue(item, index)
  const next = props.modelValue === value ? undefined : value
  emit('item-click', { item, index, event })
  emit('update:modelValue', next)
}
</script>

<style scoped>
/**
 * Vertical timeline (dot left, label right), inspired by
 * https://github.com/ir3ne/v-tmline/tree/main/src
 */
.v-timeline {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
  width: 100%;
  /** Hollow dots use this so the connector line does not show through. */
  --v-timeline-head-empty-fill: var(--ui-bg-elevated, var(--ui-bg));
}

.v-timeline__item {
  position: relative;
  margin: 0;
  padding-bottom: 16px;
  font-size: inherit;
  line-height: inherit;
  list-style: none;
  cursor: pointer;
}

.v-timeline__item:last-child {
  padding-bottom: 0;
}

.v-timeline__tail {
  position: absolute;
  top: 10px;
  left: 4px;
  height: calc(100% - 2px);
  border-inline-start: 2px solid var(--v-timeline-color);
}

.v-timeline__item:last-child .v-timeline__tail {
  display: none;
}

.v-timeline__head {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  border: 2px solid var(--v-timeline-color);
  border-radius: 50%;
  box-sizing: border-box;
  background-color: var(--v-timeline-color);
}

.v-timeline__item--outlined .v-timeline__head {
  background-color: var(--v-timeline-head-empty-fill);
}

.v-timeline__content {
  position: relative;
  top: -7px;
  margin-inline-start: 26px;
  margin-inline-end: 0;
  word-break: break-word;
}

.v-timeline__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text);
}

.v-timeline__item--active .v-timeline__label {
  font-weight: 600;
  color: var(--v-timeline-color);
}

.v-timeline__item--outlined .v-timeline__label {
  color: var(--v-timeline-color);
}

.v-timeline__detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-border, rgba(128, 128, 128, 0.25));
}

.v-timeline--align-right {
  text-align: right;
}

.v-timeline--align-right .v-timeline__tail {
  left: unset;
  right: 4px;
}

.v-timeline--align-right .v-timeline__head {
  left: unset;
  right: 0;
}

.v-timeline--align-right .v-timeline__content {
  margin-inline-start: 0;
  margin-inline-end: 26px;
}
</style>
