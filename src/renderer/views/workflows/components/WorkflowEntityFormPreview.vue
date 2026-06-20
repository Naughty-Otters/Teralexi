<script setup lang="ts">
import { computed, watch } from 'vue'
import type { WorkflowBusinessEntity } from '@shared/workflows/schema'
import { safeParseWorkflowEntities } from '@shared/workflows/definition-serialization'

const props = defineProps<{
  entitiesMd?: string
  entities?: WorkflowBusinessEntity[]
}>()

const emit = defineEmits<{
  error: [messages: string[]]
}>()

const parsed = computed(() => {
  if (props.entities != null) {
    return safeParseWorkflowEntities(props.entities)
  }
  return { success: true as const, data: [] as WorkflowBusinessEntity[] }
})

const entities = computed(() => (parsed.value.success ? parsed.value.data : []))
const errors = computed(() => (parsed.value.success ? [] : parsed.value.errors))

watch(errors, (next) => emit('error', next), { immediate: true })

function fieldLabel(field: { label?: string; key: string; required?: boolean }) {
  const base = field.label?.trim() || field.key
  return field.required ? `${base} *` : base
}
</script>

<template>
  <div class="wf-entity-forms">
    <p v-for="(err, i) in errors" :key="`err-${i}`" class="wf-entity-error">
      {{ err }}
    </p>
    <p v-if="!entities.length && !errors.length" class="wf-entity-empty">
      No business entities defined yet.
    </p>
    <section
      v-for="entity in entities"
      :key="entity.id"
      class="wf-entity-section"
    >
      <h3 class="wf-entity-title">{{ entity.name }}</h3>
      <p v-if="entity.description" class="wf-entity-desc">{{ entity.description }}</p>
      <div class="wf-entity-fields">
        <label
          v-for="field in entity.fields"
          :key="`${entity.id}-${field.key}`"
          class="wf-entity-field"
        >
          <span class="wf-entity-label">{{ fieldLabel(field) }}</span>
          <textarea
            v-if="field.type === 'text'"
            class="wf-entity-control wf-entity-textarea"
            rows="3"
            disabled
            :placeholder="field.description ?? field.key"
          />
          <input
            v-else-if="field.type === 'number'"
            class="wf-entity-control"
            type="number"
            disabled
            :placeholder="field.description ?? field.key"
          />
          <select
            v-else-if="field.type === 'select'"
            class="wf-entity-control"
            disabled
          >
            <option value="" disabled selected>
              {{ field.options?.[0]?.label ?? 'Select…' }}
            </option>
            <option
              v-for="opt in field.options ?? []"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label ?? opt.value }}
            </option>
          </select>
          <div v-else-if="field.type === 'boolean'" class="wf-entity-check-row">
            <input type="checkbox" disabled />
            <span>{{ fieldLabel(field) }}</span>
          </div>
          <input
            v-else
            class="wf-entity-control"
            :type="field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'"
            disabled
            :placeholder="field.description ?? field.key"
          />
          <span class="wf-entity-meta">
            {{ field.type }}
            ·
            {{
              field.source.kind === 'user_input'
                ? `form: ${field.source.formStepId ?? '—'}`
                : `tool: ${field.source.tool}`
            }}
          </span>
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wf-entity-forms {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
  background: var(--ui-bg-muted);
}
.wf-entity-error {
  margin: 0 0 6px;
  color: var(--ui-error);
  font-size: 0.8125rem;
}
.wf-entity-empty {
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}
.wf-entity-section + .wf-entity-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border);
}
.wf-entity-title {
  margin: 0 0 4px;
  font-size: 1rem;
}
.wf-entity-desc {
  margin: 0 0 12px;
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
}
.wf-entity-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wf-entity-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wf-entity-label {
  font-size: 0.8125rem;
  font-weight: 600;
}
.wf-entity-control {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  font-size: 0.875rem;
}
.wf-entity-textarea {
  resize: vertical;
  min-height: 72px;
}
.wf-entity-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.wf-entity-meta {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}
</style>
