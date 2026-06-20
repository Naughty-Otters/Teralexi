<template>
  <div class="asc-wrap">
    <div class="asc-filter-row">
      <label class="asc-filter-label" for="agent-tool-tag-filter">Tag</label>
      <select
        id="agent-tool-tag-filter"
        v-model="selectedTag"
        class="asc-filter-select"
        :disabled="availableTags.length === 0"
      >
        <option value="all">All tags</option>
        <option v-for="tag in availableTags" :key="tag" :value="tag">
          {{ tag }}
        </option>
      </select>
    </div>

    <div v-if="filteredTools.length === 0" class="asc-empty">
      No tools found for selected tag.
    </div>

    <div v-else class="asc-root">
      <label
        v-for="tool in filteredTools"
        :key="tool.name"
        class="asc-tool-card"
        :class="{
          'asc-tool-card--enabled': isEnabled(tool.name),
          'asc-tool-card--disabled': disabled,
          'asc-tool-card--mandatory': isMandatory(tool.name),
        }"
      >
        <span class="asc-tool-card-head">
          <span class="asc-tool-name">{{ tool.name }}</span>
          <span v-if="isMandatory(tool.name)" class="asc-mandatory-badge">Always on</span>
          <button
            v-else
            type="button"
            class="asc-toggle"
            :class="{ 'asc-toggle--on': isEnabled(tool.name) }"
            role="switch"
            :aria-checked="isEnabled(tool.name)"
            :aria-label="`Toggle ${tool.name}`"
            :disabled="disabled"
            @click.prevent="toggleTool(tool.name, !isEnabled(tool.name))"
          >
            <span class="asc-toggle-thumb" />
          </button>
        </span>
        <span v-if="tool.tags && tool.tags.length > 0" class="asc-tags">
          <span
            v-for="tag in tool.tags"
            :key="`${tool.name}-${tag}`"
            class="asc-tag"
          >
            {{ tag }}
          </span>
        </span>
        <span class="asc-tool-desc">{{ tool.description }}</span>

        <span class="asc-approval-row" @click.stop>
          <span class="asc-approval-label">Require approval</span>
          <span class="asc-approval-meta">
            Catalog: {{ tool.catalogNeedsApproval ? 'yes' : 'no' }}
          </span>
          <button
            type="button"
            class="asc-toggle asc-toggle--approval"
            :class="{ 'asc-toggle--on': effectiveNeedsApproval(tool) }"
            role="switch"
            :aria-checked="effectiveNeedsApproval(tool)"
            :aria-label="`Require approval for ${tool.name}`"
            :disabled="disabled"
            @click.prevent="toggleNeedsApproval(tool)"
          >
            <span class="asc-toggle-thumb" />
          </button>
        </span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isToolEnabledInAvailableSet } from '@shared/agent/tool-selection'
import { isMandatoryTool } from '@shared/agent/mandatory-tools'

type ToolRow = {
  name: string
  description: string
  tags?: string[]
  /** From shared toolSet scan only (reference label in UI) */
  catalogNeedsApproval: boolean
  /** Override baseline: skill metadata, else catalog */
  defaultNeedsApproval: boolean
}

const props = defineProps<{
  tools: Array<{
    name: string
    description: string
    tags?: string[]
    needsApproval?: boolean
  }>
  modelValue: string[]
  /** When false, all catalog tools are treated as enabled until the user toggles. */
  availableSetTouched?: boolean
  /** Explicit overrides; omitted keys use catalog/skill default */
  approvalOverrides: Record<string, boolean>
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'update:availableSetTouched', value: boolean): void
  (e: 'update:approvalOverrides', value: Record<string, boolean>): void
}>()

const selectedTag = ref<string>('all')

type CatalogEntry = {
  description: string
  tags: string[]
  needsApproval: boolean
}

const catalogByName = ref<Record<string, CatalogEntry>>({})

onMounted(async () => {
  const channel = window.ipcRendererChannel?.ListToolSetTools
  if (!channel?.invoke) return

  try {
    const result = (await channel.invoke()) as Array<{
      name: string
      description?: string
      tags?: string[]
      needsApproval?: boolean
    }>
    const byName: Record<string, CatalogEntry> = {}
    for (const tool of result) {
      const tags = (tool.tags ?? []).filter(
        (tag) => typeof tag === 'string' && tag.trim() !== '',
      )
      byName[tool.name] = {
        description: tool.description ?? '',
        tags: tags.length > 0 ? Array.from(new Set(tags)) : ['toolSet'],
        needsApproval: !!tool.needsApproval,
      }
    }
    catalogByName.value = byName
  } catch (err) {
    console.warn('[AvailableSetCards] ListToolSetTools failed', err)
  }
})

const normalizedTools = computed((): ToolRow[] => {
  const skillTools = props.tools ?? []
  const skillByName = new Map(skillTools.map((tool) => [tool.name, tool]))
  const names = new Set([
    ...Object.keys(catalogByName.value),
    ...skillTools.map((tool) => tool.name),
  ])

  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => {
    const skill = skillByName.get(name)
    const catalog = catalogByName.value[name]
    const cleanedTags = (skill?.tags ?? []).filter(
      (tag) => typeof tag === 'string' && tag.trim() !== '',
    )
    const catalogTags = catalog?.tags ?? []
    const catalogApproval = catalog?.needsApproval ?? false
    const skillDefault = skill?.needsApproval ?? catalogApproval

    return {
      name,
      description: skill?.description ?? catalog?.description ?? '',
      catalogNeedsApproval: catalogApproval,
      defaultNeedsApproval: skillDefault,
      tags:
        cleanedTags.length > 0
          ? Array.from(new Set(cleanedTags))
          : catalogTags.length > 0
            ? catalogTags
            : ['toolSet'],
    }
  })
})

const availableTags = computed(() => {
  return Array.from(
    new Set(normalizedTools.value.flatMap((tool) => tool.tags)),
  ).sort((a, b) => a.localeCompare(b))
})

const filteredTools = computed(() => {
  if (selectedTag.value === 'all') return normalizedTools.value
  return normalizedTools.value.filter((tool) =>
    tool.tags.includes(selectedTag.value),
  )
})

function isMandatory(toolName: string): boolean {
  return isMandatoryTool(toolName)
}

function isEnabled(toolName: string): boolean {
  return isToolEnabledInAvailableSet(toolName, {
    availableSetTouched: props.availableSetTouched === true,
    availableSet: props.modelValue ?? [],
  })
}

function toggleTool(toolName: string, enabled: boolean) {
  if (isMandatory(toolName)) return
  const allNames = normalizedTools.value.map((tool) => tool.name)
  const base = props.availableSetTouched
    ? new Set(props.modelValue ?? [])
    : new Set(allNames)
  if (enabled) base.add(toolName)
  else base.delete(toolName)
  emit('update:modelValue', Array.from(base))
  if (!props.availableSetTouched) {
    emit('update:availableSetTouched', true)
  }
}

function effectiveNeedsApproval(tool: ToolRow): boolean {
  const base = tool.defaultNeedsApproval
  const o = props.approvalOverrides[tool.name]
  return typeof o === 'boolean' ? o : base
}

function toggleNeedsApproval(tool: ToolRow) {
  const base = tool.defaultNeedsApproval
  const current = effectiveNeedsApproval(tool)
  const nextVal = !current
  const next = { ...props.approvalOverrides }
  if (nextVal === base) {
    delete next[tool.name]
  } else {
    next[tool.name] = nextVal
  }
  emit('update:approvalOverrides', next)
}
</script>

<style scoped>
.asc-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.asc-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.asc-filter-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-muted);
}

.asc-filter-select {
  min-width: 150px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  font-size: 11px;
  padding: 6px 8px;
}

.asc-empty {
  border: 1px dashed var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  font-size: 11px;
  padding: 10px;
}

.asc-root {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  border-radius: 8px;
  padding: 10px;
}

.asc-tool-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  min-height: 66px;
}

.asc-tool-card:hover {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500) 35%,
    var(--ui-border)
  );
}

.asc-tool-card--enabled {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500) 55%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-primary-500) 8%,
    var(--ui-bg-elevated)
  );
}

.asc-tool-card--disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.asc-tool-card--mandatory {
  cursor: default;
}

.asc-mandatory-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-primary-600, var(--ui-text));
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary-500) 35%, var(--ui-border));
  border-radius: 999px;
  padding: 2px 6px;
  flex-shrink: 0;
}

.asc-tool-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.asc-tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asc-tool-desc {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.3;
  line-clamp: 2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.asc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.asc-tag {
  font-size: 9px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
}

.asc-toggle {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-accented);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 1px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
  flex-shrink: 0;
}

.asc-toggle-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  transition:
    transform 0.15s,
    border-color 0.15s,
    background 0.15s;
}

.asc-toggle--on {
  background: var(--color-success-500, #22c55e);
  border-color: var(--ui-border);
  box-shadow: none;
}

.asc-toggle--on .asc-toggle-thumb {
  transform: translateX(14px);
  border-color: color-mix(
    in srgb,
    var(--color-primary-700, #1d4ed8) 55%,
    white
  );
  background: white;
}

.asc-toggle:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.asc-approval-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
  margin-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
}

.asc-approval-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.asc-approval-meta {
  font-size: 10px;
  color: var(--ui-text-muted);
  opacity: 0.85;
  flex: 1;
  min-width: 0;
}

.asc-toggle--approval {
  margin-left: auto;
}
</style>
