<template>
  <div class="hitl-form-card">
    <div class="hitl-form-card-title">{{ displayTitle }}</div>
    <p v-if="displayMessage" class="hitl-form-message">{{ displayMessage }}</p>
    <p v-else-if="data?.todoName && !data?.title" class="hitl-form-meta">
      Task {{ data?.todoId }}: {{ data?.todoName }}
    </p>
    <p v-if="data?.formDocName" class="hitl-form-meta">
      Form reference: {{ data?.formDocName }}
    </p>
    <details
      v-if="showMarkdownPreview"
      class="hitl-form-details"
    >
      <summary>Reference document</summary>
      <pre class="hitl-form-md">{{ data?.markdownPreview }}</pre>
    </details>
    <div class="hitl-form-fields">
      <template v-for="field in data?.fields ?? []" :key="`${messageId}-${requestId}-${field.key}`">
        <label class="hitl-form-label">
          <span class="hitl-form-label-text"
            >{{ field.label }}{{ field.required ? ' *' : '' }}</span
          >
          <textarea
            v-if="field.type === 'text'"
            class="hitl-form-control hitl-form-textarea"
            rows="3"
            :placeholder="field.placeholder ?? ''"
            :value="fieldValue(field.key)"
            @input="
              setField(
                field.key,
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
          <input
            v-else-if="field.type === 'number'"
            class="hitl-form-control"
            type="number"
            :placeholder="field.placeholder ?? ''"
            :value="fieldValue(field.key)"
            @input="
              setField(field.key, ($event.target as HTMLInputElement).value)
            "
          />
          <select
            v-else-if="field.type === 'select'"
            class="hitl-form-control hitl-form-select"
            :value="fieldValue(field.key)"
            @change="
              setField(field.key, ($event.target as HTMLSelectElement).value)
            "
          >
            <option value="" disabled>
              {{ field.placeholder?.trim() || 'Choose an option…' }}
            </option>
            <option
              v-for="opt in field.options ?? []"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
          <div v-else-if="field.type === 'boolean'" class="hitl-form-check-row">
            <label class="hitl-form-check">
              <input
                type="checkbox"
                :checked="fieldValue(field.key) === 'true'"
                @change="
                  setField(
                    field.key,
                    ($event.target as HTMLInputElement).checked ? 'true' : '',
                  )
                "
              />
              <span>{{ field.label }}{{ field.required ? ' *' : '' }}</span>
            </label>
          </div>
          <input
            v-else
            class="hitl-form-control"
            type="text"
            :placeholder="field.placeholder ?? ''"
            :value="fieldValue(field.key)"
            @input="
              setField(field.key, ($event.target as HTMLInputElement).value)
            "
          />
        </label>
      </template>
    </div>
    <div class="hitl-form-actions">
      <UButton
        size="sm"
        color="primary"
        class="cp-btn-primary cp-btn-sm"
        :disabled="disabled || !requestId || !canSubmit()"
        @click="onSubmit"
      >
        Submit
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { asCollectFormPart, collectFormPartData } from './chat/collectFormTypes'

const props = defineProps<{
  /** For stable field keys in v-for */
  messageId: string
  part: unknown
  disabled: boolean
}>()

const resolvedPart = computed(() => asCollectFormPart(props.part))

const emit = defineEmits<{
  submit: [payload: { requestId: string; values: Record<string, unknown> }]
}>()

const data = computed(() => collectFormPartData(resolvedPart.value))
const requestId = computed(() => resolvedPart.value.id?.trim() ?? '')

const displayTitle = computed(
  () => data.value?.title?.trim() || 'Additional information required',
)
const displayMessage = computed(() => data.value?.message?.trim() || '')

const showMarkdownPreview = computed(() => {
  const preview = data.value?.markdownPreview?.trim()
  if (!preview) return false
  const docName = data.value?.formDocName?.trim().toLowerCase() ?? ''
  if (docName === 'generated.form.md') return false
  if (preview.startsWith('<!-- FORM_SCHEMA')) return false
  return true
})

/** Draft strings per request id — module would reset on navigation; parent remounts chat anyway */
const drafts = reactive<Record<string, Record<string, string>>>({})

function ensureDraft(id: string) {
  if (!drafts[id]) drafts[id] = {}
}

function fieldValue(key: string): string {
  const id = requestId.value
  if (!id) return ''
  ensureDraft(id)
  return drafts[id][key] ?? ''
}

function setField(key: string, value: string) {
  const id = requestId.value
  if (!id) return
  ensureDraft(id)
  drafts[id][key] = value
}

function canSubmit(): boolean {
  const fields = data.value?.fields ?? []
  for (const f of fields) {
    if (!f.required) continue
    const v = fieldValue(f.key)
    if (f.type === 'boolean') {
      if (v !== 'true') return false
    } else if (!v.trim()) {
      return false
    }
  }
  return true
}

function onSubmit() {
  const id = requestId.value
  if (!id || props.disabled || !canSubmit()) return
  const fields = data.value?.fields ?? []
  ensureDraft(id)
  const raw = drafts[id]
  const values: Record<string, unknown> = {}
  for (const f of fields) {
    const k = f.key
    const v = raw[k] ?? ''
    if (f.type === 'number') {
      const n = Number(v)
      values[k] = Number.isFinite(n) ? n : v
    } else if (f.type === 'boolean') {
      values[k] = v === 'true' || v === 'on' || v === '1'
    } else {
      values[k] = v
    }
  }
  emit('submit', { requestId: id, values })
}
</script>

<style scoped>
.hitl-form-card {
  padding: 0;
  background: transparent;
  max-width: 100%;
}
.hitl-form-card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
  margin-bottom: 8px;
}
.hitl-form-message {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.45;
  color: var(--ui-text);
  white-space: pre-wrap;
}
.hitl-form-meta {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--ui-text-muted);
}
.hitl-form-details {
  margin-bottom: 10px;
  font-size: 12px;
}
.hitl-form-md {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  font-size: 11px;
  white-space: pre-wrap;
  max-height: 220px;
  overflow: auto;
}
.hitl-form-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.hitl-form-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.hitl-form-label-text {
  font-weight: 600;
}
.hitl-form-control {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  font-size: 13px;
  box-sizing: border-box;
}
.hitl-form-textarea {
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
}
.hitl-form-select {
  cursor: pointer;
}
.hitl-form-check-row {
  margin-top: 2px;
}
.hitl-form-check {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.hitl-form-actions {
  display: flex;
  gap: 8px;
}
</style>
