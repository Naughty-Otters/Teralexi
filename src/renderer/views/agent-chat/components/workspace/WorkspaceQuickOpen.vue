<template>
  <div
    v-if="open"
    class="workspace-quick-open"
    role="dialog"
    aria-modal="true"
    aria-label="Quick open file"
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
        placeholder="Search files by name…"
        aria-label="Search files"
        @keydown="onInputKeydown"
      />
      <p v-if="loading" class="workspace-quick-open-hint">Searching…</p>
      <p v-else-if="error" class="workspace-quick-open-hint workspace-quick-open-hint--error">
        {{ error }}
      </p>
      <p
        v-else-if="query.trim() && items.length === 0"
        class="workspace-quick-open-hint"
      >
        No matching files
      </p>
      <ul
        v-else
        class="workspace-quick-open-list"
        role="listbox"
        aria-label="Matching files"
      >
        <li
          v-for="(path, index) in items"
          :key="path"
          role="option"
          :aria-selected="index === highlightIndex"
        >
          <button
            type="button"
            class="workspace-quick-open-item"
            :class="{ 'workspace-quick-open-item--active': index === highlightIndex }"
            @mousedown.prevent
            @click="selectPath(path)"
          >
            <UIcon
              name="i-lucide-file"
              class="workspace-quick-open-item-icon"
              aria-hidden="true"
            />
            <span class="workspace-quick-open-item-path">{{ path }}</span>
          </button>
        </li>
      </ul>
      <p class="workspace-quick-open-footer">
        <kbd>↑↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  conversationId: string | null
}>()

const emit = defineEmits<{
  close: []
  select: [relativePath: string]
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const query = ref('')
const items = ref<string[]>([])
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
  }, 120)
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
    const ch = window.ipcRendererChannel?.SearchWorkspaceFiles
    if (!ch?.invoke) {
      items.value = []
      error.value = 'File search is unavailable.'
      return
    }

    const result = await ch.invoke({
      conversationId: cid,
      query: rawQuery.trim(),
      limit: 30,
    })

    if (token !== searchToken) return

    if (!result.ok) {
      items.value = []
      error.value = result.error ?? 'Search failed.'
      return
    }

    items.value = result.paths
    highlightIndex.value = 0
  } finally {
    if (token === searchToken) loading.value = false
  }
}

function selectPath(path: string) {
  emit('select', path)
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
    const path = items.value[highlightIndex.value]
    if (path) selectPath(path)
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
  width: min(520px, 100%);
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
  font-size: var(--app-font-size);
  font-family: var(--app-font-family);
  padding: 12px 14px;
  outline: none;
}

.workspace-quick-open-hint {
  margin: 0;
  padding: 14px;
  font-size: var(--app-font-size-secondary);
  color: var(--ui-text-muted);
}

.workspace-quick-open-hint--error {
  color: var(--color-error-600, #dc2626);
}

.workspace-quick-open-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 280px;
  overflow-y: auto;
}

.workspace-quick-open-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text);
  font-size: var(--app-font-size-secondary);
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
  color: var(--ui-text-muted);
}

.workspace-quick-open-item-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-quick-open-footer {
  margin: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--ui-border);
  font-size: var(--app-font-size-xs);
  color: var(--ui-text-muted);
}

.workspace-quick-open-footer kbd {
  font-family: var(--app-font-family);
  font-size: var(--app-font-size-xs);
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
}
</style>
