<template>
  <div
    class="panel-resize-handle"
    :class="{
      'panel-resize-handle--active': active,
      'panel-resize-handle--after-start': placement === 'after-start',
      'panel-resize-handle--before-end': placement === 'before-end',
    }"
    role="separator"
    aria-orientation="vertical"
    :aria-label="ariaLabel"
    tabindex="0"
    @pointerdown="emit('pointerdown', $event)"
    @keydown="onKeydown"
  />
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    placement?: 'after-start' | 'before-end'
    active?: boolean
    ariaLabel?: string
  }>(),
  {
    placement: 'after-start',
    active: false,
    ariaLabel: 'Resize panels',
  },
)

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  'keyboard-resize': [delta: number]
}>()

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 32 : 8
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('keyboard-resize', props.placement === 'after-start' ? -step : step)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('keyboard-resize', props.placement === 'after-start' ? step : -step)
  }
}
</script>

<style scoped>
.panel-resize-handle {
  flex-shrink: 0;
  width: 6px;
  margin: 0 -3px;
  position: relative;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
  transition: background 0.12s;
}

.panel-resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: var(--ui-border);
  transition:
    background 0.12s,
    width 0.12s;
}

.panel-resize-handle:hover::after,
.panel-resize-handle:focus-visible::after,
.panel-resize-handle--active::after {
  width: 2px;
  background: color-mix(in srgb, var(--color-primary-500) 55%, var(--ui-border));
}

.panel-resize-handle:focus-visible {
  outline: none;
}
</style>
