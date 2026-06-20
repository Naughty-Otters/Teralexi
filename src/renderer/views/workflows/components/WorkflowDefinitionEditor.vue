<template>
  <div v-show="visible" class="wf-def-editor">
    <div class="wf-def-editor-toolbar">
      <span class="wf-def-editor-label">workflow-definition.json</span>
      <span v-if="dirty" class="wf-def-editor-dirty">{{ t.workflows.studio.unsaved }}</span>
      <div class="wf-def-editor-actions">
        <button
          type="button"
          class="wf-def-editor-btn"
          :title="t.workflows.studio.formatJson"
          :disabled="disabled || saving || Boolean(parseError)"
          @click="formatJson"
        >
          {{ t.workflows.studio.formatJson }}
        </button>
        <button
          type="button"
          class="wf-def-editor-btn wf-def-editor-btn--primary"
          :disabled="disabled || saving || !dirty || Boolean(parseError)"
          @click="emit('save')"
        >
          {{ saving ? t.workflows.studio.savingDefinition : t.workflows.studio.saveDefinition }}
        </button>
      </div>
    </div>
    <p v-if="parseError" class="wf-def-editor-error">{{ parseError }}</p>
    <div v-if="disabled" class="wf-def-editor-empty">{{ emptyText }}</div>
    <MonacoEditor
      v-else
      :model-value="modelValue"
      class="wf-def-editor-monaco"
      language="json"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import MonacoEditor from '@renderer/components/code/MonacoEditor.vue'
import { useI18n } from '@renderer/composables/useI18n'

const props = defineProps<{
  modelValue: string
  visible?: boolean
  disabled?: boolean
  dirty?: boolean
  saving?: boolean
  parseError?: string | null
  emptyText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
}>()

const { t } = useI18n()

function formatJson() {
  if (props.disabled || props.parseError) return
  try {
    const formatted = `${JSON.stringify(JSON.parse(props.modelValue), null, 2)}\n`
    emit('update:modelValue', formatted)
  } catch {
    // parseError already shown by parent
  }
}
</script>

<style scoped>
.wf-def-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg-muted);
}
.wf-def-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
  flex-shrink: 0;
  background: var(--ui-bg);
}
.wf-def-editor-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wf-def-editor-dirty {
  font-size: 0.75rem;
  color: var(--ui-warning);
}
.wf-def-editor-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.wf-def-editor-btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  font-size: 0.8125rem;
  cursor: pointer;
}
.wf-def-editor-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.wf-def-editor-btn--primary {
  background: var(--ui-primary);
  color: white;
  border-color: transparent;
}
.wf-def-editor-error {
  margin: 0;
  padding: 8px 12px;
  color: var(--ui-error);
  font-size: 0.8125rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-error) 25%, var(--ui-border));
  flex-shrink: 0;
}
.wf-def-editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  text-align: center;
}
.wf-def-editor-monaco {
  flex: 1;
  min-height: 0;
}
</style>
