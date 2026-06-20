<template>
  <div
    v-if="open"
    class="workspace-quick-open"
    role="dialog"
    aria-modal="true"
    aria-label="Go to symbol in workspace"
    @mousedown.self="emit('close')"
  >
    <div class="workspace-quick-open-panel">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="workspace-quick-open-input"
        spellcheck="false"
        autocomplete="off"
        placeholder="Search symbols across workspace…"
        aria-label="Search symbols"
        @keydown="onInputKeydown"
      />
      <p v-if="loading" class="workspace-quick-open-hint">
        Searching symbols…
        <span class="workspace-quick-open-hint-sub">First search may take a few seconds.</span>
      </p>
      <p v-else-if="error" class="workspace-quick-open-hint workspace-quick-open-hint--error">
        {{ error }}
      </p>
      <p
        v-else-if="!query.trim() && items.length === 0"
        class="workspace-quick-open-hint"
      >
        Type to filter workspace symbols
      </p>
      <p
        v-else-if="query.trim() && items.length === 0"
        class="workspace-quick-open-hint"
      >
        No matching symbols
      </p>
      <ul
        v-else
        class="workspace-quick-open-list"
        role="listbox"
        aria-label="Matching symbols"
      >
        <li
          v-for="(item, index) in items"
          :key="`${item.path}:${item.line}:${item.character}:${item.name}`"
          role="option"
          :aria-selected="index === highlightIndex"
        >
          <button
            type="button"
            class="workspace-quick-open-item"
            :class="{ 'workspace-quick-open-item--active': index === highlightIndex }"
            @mousedown.prevent
            @click="selectItem(item)"
          >
            <UIcon
              name="i-lucide-box"
              class="workspace-quick-open-item-icon"
              aria-hidden="true"
            />
            <span class="workspace-quick-open-item-main">
              <span class="workspace-quick-open-item-title">
                {{ item.name }}
                <span class="workspace-quick-open-item-kind">{{ item.kind }}</span>
              </span>
              <span class="workspace-quick-open-item-path">
                {{ item.path }}:{{ item.line }}
                <template v-if="item.container"> · {{ item.container }}</template>
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p class="workspace-quick-open-footer">
        <kbd>↑↓</kbd> navigate · <kbd>↵</kbd> go to symbol · <kbd>esc</kbd> close
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { SharedWorkspaceSymbol } from '@shared/editor/workspace-symbol-types'

const props = defineProps<{
  open: boolean
  conversationId: string | null
}>()

const emit = defineEmits<{
  close: []
  select: [symbol: SharedWorkspaceSymbol]
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const query = ref('')
const items = ref<SharedWorkspaceSymbol[]>([])
const highlightIndex = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

let searchToken = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      query.value = ''
      items.value = []
      highlightIndex.value = 0
      error.value = null
      loading.value = false
      if (debounceTimer) clearTimeout(debounceTimer)
      return
    }
    void nextTick(() => {
      inputEl.value?.focus()
      void runSearch('')
    })
  },
)

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSearch(value)
  }, 200)
})

watch(items, (list) => {
  if (highlightIndex.value >= list.length) {
    highlightIndex.value = Math.max(0, list.length - 1)
  }
})

async function runSearch(rawQuery: string): Promise<void> {
  const cid = props.conversationId?.trim()
  if (!cid) {
    items.value = []
    error.value = 'No conversation selected.'
    return
  }

  const token = ++searchToken
  loading.value = true
  error.value = null

  try {
    const ch = window.ipcRendererChannel?.EditorLspWorkspaceSymbols
    if (!ch?.invoke) {
      items.value = []
      error.value = 'Symbol search is unavailable.'
      return
    }

    const result = await ch.invoke({
      conversationId: cid,
      query: rawQuery.trim(),
    })

    if (token !== searchToken) return

    if (!result.ok) {
      items.value = []
      error.value = result.error ?? 'Symbol search failed.'
      return
    }

    items.value = result.symbols ?? []
    highlightIndex.value = 0
  } finally {
    if (token === searchToken) loading.value = false
  }
}

function selectItem(item: SharedWorkspaceSymbol) {
  emit('select', item)
  emit('close')
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (items.value.length === 0) return
    highlightIndex.value = (highlightIndex.value + 1) % items.value.length
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (items.value.length === 0) return
    highlightIndex.value =
      (highlightIndex.value - 1 + items.value.length) % items.value.length
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const item = items.value[highlightIndex.value]
    if (item) selectItem(item)
  }
}
</script>

<style scoped>
.workspace-quick-open {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12% 16px 16px;
  background: color-mix(in srgb, var(--ui-text) 18%, transparent);
}

.workspace-quick-open-panel {
  width: min(560px, 100%);
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow: 0 16px 48px color-mix(in srgb, var(--ui-text) 22%, transparent);
  overflow: hidden;
}

.workspace-quick-open-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-text);
  font-size: 13px;
  font-family: var(--app-font-family);
  padding: 12px 14px;
  outline: none;
}

.workspace-quick-open-hint {
  margin: 0;
  padding: 14px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.workspace-quick-open-hint--error {
  color: var(--color-error-600, #dc2626);
}

.workspace-quick-open-hint-sub {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.85;
}

.workspace-quick-open-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 320px;
  overflow-y: auto;
}

.workspace-quick-open-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text);
  font-size: 12px;
  font-family: var(--app-font-family);
  text-align: left;
  padding: 7px 10px;
  cursor: pointer;
}

.workspace-quick-open-item:hover,
.workspace-quick-open-item--active {
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}

.workspace-quick-open-item-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--ui-text-muted);
}

.workspace-quick-open-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workspace-quick-open-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-quick-open-item-kind {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--ui-text-muted);
  text-transform: lowercase;
}

.workspace-quick-open-item-path {
  font-size: 10px;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-quick-open-footer {
  margin: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--ui-border);
  font-size: 10px;
  color: var(--ui-text-muted);
}

.workspace-quick-open-footer kbd {
  font-family: var(--app-font-family);
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
}
</style>
