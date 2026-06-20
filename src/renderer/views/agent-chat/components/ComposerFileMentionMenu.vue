<template>
  <div
    v-if="open && items.length > 0"
    class="file-mention-menu"
    role="listbox"
    aria-label="File mentions"
  >
    <button
      v-for="path in items"
      :key="path"
      type="button"
      class="file-mention-menu__item"
      role="option"
      @mousedown.prevent
      @click.stop="emit('select', path)"
    >
      <UIcon name="i-lucide-file" class="file-mention-menu__icon" aria-hidden="true" />
      <span class="file-mention-menu__path">{{ path }}</span>
    </button>
  </div>
  <p v-else-if="open && loading" class="file-mention-menu file-mention-menu--hint">
    Searching files…
  </p>
  <p v-else-if="open && query.length > 0 && !loading" class="file-mention-menu file-mention-menu--hint">
    No matching files
  </p>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
  query: string
  items: string[]
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [path: string]
}>()
</script>

<style scoped>
.file-mention-menu {
  position: absolute;
  left: 10px;
  right: 52px;
  bottom: calc(100% + 4px);
  z-index: 20;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background-color: var(--ui-bg, #ffffff);
  background-image: linear-gradient(
    var(--ui-bg, #ffffff),
    var(--ui-bg, #ffffff)
  );
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ui-border) 80%, transparent),
    0 10px 28px color-mix(in srgb, var(--ui-text) 18%, transparent);
  padding: 4px;
  isolation: isolate;
}

.file-mention-menu--hint {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.file-mention-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background-color: var(--ui-bg, #ffffff);
  color: var(--ui-text);
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}

.file-mention-menu__item:hover,
.file-mention-menu__item:focus-visible {
  background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  outline: none;
}

.file-mention-menu__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.file-mention-menu__path {
  font-family: var(--app-font-family);
  word-break: break-all;
}
</style>
