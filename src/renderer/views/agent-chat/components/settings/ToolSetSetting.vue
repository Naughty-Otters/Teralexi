<template>
  <div class="ts-layout">
    <!-- Left sidebar: tool list -->
    <aside class="ts-sidebar">
      <div v-if="loading" class="ts-sidebar-empty">{{ t.common.loading }}</div>
      <div v-else class="ts-filter-wrap">
        <label class="ts-filter-label" for="tool-tag-filter">{{ p.fields.tag }}</label>
        <select
          id="tool-tag-filter"
          v-model="selectedTag"
          class="ts-filter-select"
        >
          <option value="all">{{ p.toolset.allTags }}</option>
          <option v-for="tag in availableTags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
      </div>

      <div
        v-if="!loading && filteredTools.length === 0"
        class="ts-sidebar-empty"
      >
        {{ p.toolset.noTools }}
      </div>

      <button
        v-for="tool in filteredTools"
        :key="tool.name"
        class="ts-tab"
        :class="{ 'ts-tab--active': selectedName === tool.name }"
        @click="selectedName = tool.name"
      >
        <span class="ts-tab-icon">
          <UIcon name="i-lucide-wrench" />
        </span>
        <span class="ts-tab-name">{{ tool.name }}</span>
        <span v-if="tool.tags.length > 0" class="ts-tab-tag">
          {{ tool.tags[0] }}
        </span>
        <span v-if="tool.needsApproval" class="ts-tab-badge">{{ p.toolset.approvalBadge }}</span>
      </button>
    </aside>

    <!-- Right pane: tool detail -->
    <section v-if="selectedTool" class="ts-content ts-section">
      <div class="ts-title-row">
        <span class="ts-title">{{ selectedTool.name }}</span>
        <span v-if="selectedTool.needsApproval" class="ts-chip ts-chip--warn">
          {{ p.toolset.requiresApproval }}
        </span>
        <span v-else class="ts-chip ts-chip--ok">{{ p.toolset.autoRun }}</span>
        <span v-if="selectedTool.os" class="ts-chip ts-chip--os">
          {{ selectedTool.os }}
        </span>
        <span
          v-for="tag in selectedTool.tags"
          :key="`${selectedTool.name}-${tag}`"
          class="ts-chip ts-chip--tag"
        >
          {{ tag }}
        </span>
      </div>

      <div class="ts-desc-card">
        <p class="ts-desc">{{ selectedTool.description }}</p>
      </div>

      <!-- Parameters table -->
      <div v-if="selectedTool.params.length > 0" class="ts-params-section">
        <div class="ts-params-header">{{ p.toolset.parameters }}</div>
        <div class="ts-params-table">
          <div class="ts-params-row ts-params-heading">
            <span>{{ p.fields.name }}</span>
            <span>{{ p.fields.type }}</span>
            <span>{{ p.fields.required }}</span>
          </div>
          <div
            v-for="param in selectedTool.params"
            :key="param.name"
            class="ts-params-row"
          >
            <span class="ts-param-name">{{ param.name }}</span>
            <span class="ts-param-type">{{ param.type }}</span>
            <span :class="param.required ? 'ts-param-req' : 'ts-param-opt'">
              {{
                param.required
                  ? p.toolset.requiredParam
                  : param.default !== undefined
                    ? `${p.toolset.defaultPrefix} ${param.default}`
                    : p.toolset.optionalParam
              }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Empty state -->
    <section v-else class="ts-content ts-empty">
      <span>{{ p.toolset.empty }}</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

interface ToolEntry {
  name: string
  tags: string[]
  description: string
  needsApproval?: boolean
  os?: 'mac' | 'linux' | 'win'
  params: Array<{
    name: string
    type: string
    required: boolean
    description?: string
    default?: string
  }>
}

const tools = ref<ToolEntry[]>([])
const loading = ref(true)
const selectedName = ref<string | null>(null)
const selectedTag = ref<string>('all')

const availableTags = computed(() => {
  return Array.from(new Set(tools.value.flatMap((t) => t.tags))).sort((a, b) =>
    a.localeCompare(b),
  )
})

const filteredTools = computed(() => {
  if (selectedTag.value === 'all') return tools.value
  return tools.value.filter((tool) => tool.tags.includes(selectedTag.value))
})

const selectedTool = computed(
  () => filteredTools.value.find((t) => t.name === selectedName.value) ?? null,
)

watch([filteredTools, selectedName], ([list, current]) => {
  if (list.length === 0) {
    selectedName.value = null
    return
  }

  if (!current || !list.some((tool) => tool.name === current)) {
    selectedName.value = list[0].name
  }
})

onMounted(async () => {
  const channel = window.ipcRendererChannel?.ListToolSetTools
  if (channel?.invoke) {
    try {
      const result = (await channel.invoke()) as ToolEntry[]
      tools.value = result.map((tool) => {
        const tags = Array.isArray(tool.tags)
          ? tool.tags.filter(
              (tag) => typeof tag === 'string' && tag.trim() !== '',
            )
          : []
        return {
          ...tool,
          tags: tags.length > 0 ? Array.from(new Set(tags)) : ['toolSet'],
        }
      })
      if (result.length > 0) selectedName.value = result[0].name
    } catch (err) {
      console.warn('[ToolSetSetting] ListToolSetTools failed', err)
    }
  }
  loading.value = false
})
</script>

<style scoped>
/* ── Two-pane layout ── */
.ts-layout {
  display: flex;
  align-items: flex-start;
  gap: 0;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
}

.ts-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
}

.ts-filter-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 4px 8px;
}

.ts-filter-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted);
}

.ts-filter-select {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  font-size: 11px;
  padding: 6px 8px;
}

.ts-sidebar-empty {
  font-size: 11px;
  color: var(--ui-text-muted);
  padding: 6px 10px;
  opacity: 0.7;
}

.ts-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--ui-text);
  transition: background 0.12s;
  width: 100%;
}

.ts-tab:hover {
  background: var(--ui-bg-accented);
}

.ts-tab-icon {
  display: inline-flex;
  align-items: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.ts-tab-name {
  font-size: 12px;
  font-weight: 500;
  font-family: var(--app-font-family);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.ts-tab-tag {
  font-size: 9px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
  flex-shrink: 0;
}

.ts-tab-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 15%,
    transparent
  );
  color: var(--color-warning-600, #d97706);
  flex-shrink: 0;
}

/* ── Right pane ── */
.ts-content {
  flex: 1;
  min-width: 0;
  padding: 16px;
  overflow-y: auto;
}

.ts-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ts-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.ts-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ui-border);
}

.ts-title {
  font-size: 14px;
  font-weight: 700;
  font-family: var(--app-font-family);
  color: var(--ui-text);
  flex: 1;
}

.ts-chip {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid;
}

.ts-chip--ok {
  background: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 12%,
    transparent
  );
  color: var(--color-success-600, #16a34a);
  border-color: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 35%,
    transparent
  );
}

.ts-chip--warn {
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 12%,
    transparent
  );
  color: var(--color-warning-600, #d97706);
  border-color: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 35%,
    transparent
  );
}

.ts-chip--os {
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
}

.ts-chip--tag {
  background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  color: var(--color-primary-600, #2563eb);
  border-color: color-mix(in srgb, var(--color-primary-500) 30%, transparent);
}

.ts-desc-card {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  padding: 14px;
}

.ts-desc {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text);
  line-height: 1.6;
}

/* ── Parameters table ── */
.ts-params-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-params-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
}

.ts-params-table {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  overflow: hidden;
}

.ts-params-row {
  display: grid;
  grid-template-columns: 1fr 110px 130px;
  gap: 0;
  padding: 7px 12px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 12px;
  align-items: center;
}

.ts-params-row:last-child {
  border-bottom: none;
}

.ts-params-heading {
  background: var(--ui-bg-accented);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted);
}

.ts-param-name {
  font-family: var(--app-font-family);
  font-size: 12px;
  color: var(--ui-text);
  font-weight: 500;
}

.ts-param-type {
  font-family: var(--app-font-family);
  font-size: 11px;
  color: var(--color-primary-600, #2563eb);
  background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-block;
}

.ts-param-req {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-error-600, #dc2626);
}

.ts-param-opt {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-family: var(--app-font-family);
}
</style>
