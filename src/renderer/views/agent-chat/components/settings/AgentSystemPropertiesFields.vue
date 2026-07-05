<template>
  <div class="asp-fields">
    <div v-if="loading" class="asp-loading">{{ loadingLabel }}</div>
    <template v-else>
      <div
        v-for="field in fields"
        :key="field.spec.key"
        class="sp-field"
      >
        <label class="sp-label">{{ field.spec.label }}</label>
        <input
          v-if="field.spec.type === 'secret'"
          class="sp-input sp-key-input"
          type="password"
          :value="field.value"
          :placeholder="field.spec.placeholder ?? ''"
          :disabled="disabled || savingKey === field.spec.key"
          spellcheck="false"
          autocomplete="off"
          @input="
            emit('update-field', field.spec.key, ($event.target as HTMLInputElement).value)
          "
          @blur="emit('persist', field.spec.key)"
        />
        <input
          v-else
          class="sp-input"
          type="text"
          :value="field.value"
          :placeholder="field.spec.placeholder ?? ''"
          :disabled="disabled || savingKey === field.spec.key"
          spellcheck="false"
          autocomplete="off"
          @input="
            emit('update-field', field.spec.key, ($event.target as HTMLInputElement).value)
          "
          @blur="emit('persist', field.spec.key)"
        />
        <span v-if="field.spec.description" class="asp-hint">
          {{ field.spec.description }}
        </span>
      </div>
      <p v-if="error" class="asp-error" role="alert">{{ error }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AgentSystemPropertyFieldView } from '@renderer/composables/useAgentSystemPropertiesSettings'

defineProps<{
  fields: AgentSystemPropertyFieldView[]
  loading: boolean
  loadingLabel: string
  savingKey: string | null
  error: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update-field': [key: string, value: string]
  persist: [key: string]
}>()
</script>

<style scoped>
.asp-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.asp-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.asp-hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.asp-error {
  margin: 0;
  font-size: 12px;
  color: var(--color-error-600, #dc2626);
}
</style>
