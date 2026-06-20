<template>
  <div class="coding-mode-bar" role="toolbar" aria-label="Coding mode">
    <span class="coding-mode-bar__label">Mode</span>
    <div class="coding-mode-bar__modes">
      <button
        v-for="mode in modes"
        :key="mode"
        type="button"
        class="coding-mode-bar__btn"
        :class="{ 'coding-mode-bar__btn--active': mode === activeMode }"
        :title="modeHints[mode]"
        @click="selectMode(mode)"
      >
        {{ modeLabels[mode] }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CODING_MODES,
  codingModeLabel,
  type CodingMode,
} from '@shared/agent/coding-mode'

const props = defineProps<{
  activeMode: CodingMode
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:activeMode': [mode: CodingMode]
}>()

const modes = CODING_MODES.filter((m) => m !== 'normal')

const modeLabels: Record<CodingMode, string> = {
  normal: codingModeLabel('normal'),
  explore: codingModeLabel('explore'),
  yolo: codingModeLabel('yolo'),
  auto: codingModeLabel('auto'),
}

const modeHints: Record<CodingMode, string> = {
  normal: 'Standard approval flow',
  explore: 'Read-only exploring until you allow writes',
  yolo: 'Skip tool approvals',
  auto: 'Auto-approve tools; no clarifying questions',
}

function selectMode(mode: CodingMode) {
  if (props.disabled) return
  const next = props.activeMode === mode && mode !== 'normal' ? 'normal' : mode
  emit('update:activeMode', next)
}
</script>

<style scoped>
.coding-mode-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 8px;
}
.coding-mode-bar__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}
.coding-mode-bar__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.coding-mode-bar__btn {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.coding-mode-bar__btn:hover:not(:disabled) {
  color: var(--ui-text);
  border-color: color-mix(in srgb, var(--ui-border) 60%, var(--ui-text));
}
.coding-mode-bar__btn--active {
  color: var(--color-primary-600, var(--ui-text));
  border-color: color-mix(in srgb, var(--color-primary-500) 50%, var(--ui-border));
  background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
}
.coding-mode-bar__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
