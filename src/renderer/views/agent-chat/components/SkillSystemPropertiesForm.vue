<template>
  <section
    class="skill-setup-form"
    role="region"
    :aria-label="title"
  >
    <div class="skill-setup-form__header">
      <div class="skill-setup-form__title">{{ title }}</div>
      <p class="skill-setup-form__intro">{{ intro }}</p>
    </div>

    <div v-if="loading" class="skill-setup-form__loading">{{ loadingLabel }}</div>

    <template v-else>
      <div class="skill-setup-form__fields">
        <label
          v-for="field in fields"
          :key="field.key"
          class="skill-setup-form__field"
        >
          <span class="skill-setup-form__label">{{ field.spec.label }}</span>
          <input
            v-if="field.spec.type === 'secret'"
            class="skill-setup-form__input"
            type="password"
            :value="field.value"
            :placeholder="field.spec.placeholder ?? ''"
            :disabled="saving"
            spellcheck="false"
            autocomplete="off"
            @input="
              emit(
                'update-field',
                field.key,
                ($event.target as HTMLInputElement).value,
              )
            "
          />
          <input
            v-else
            class="skill-setup-form__input"
            type="text"
            :value="field.value"
            :placeholder="field.spec.placeholder ?? ''"
            :disabled="saving"
            spellcheck="false"
            autocomplete="off"
            @input="
              emit(
                'update-field',
                field.key,
                ($event.target as HTMLInputElement).value,
              )
            "
          />
          <span v-if="field.spec.description" class="skill-setup-form__hint">
            {{ field.spec.description }}
          </span>
        </label>
      </div>

      <p v-if="error" class="skill-setup-form__error" role="alert">{{ error }}</p>

      <div class="skill-setup-form__actions">
        <button
          type="button"
          class="skill-setup-form__save"
          :disabled="!canSave"
          @click="emit('save')"
        >
          {{ saving ? savingLabel : saveLabel }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { SkillSystemPropertyFieldView } from '@renderer/composables/useSkillSystemProperties'

defineProps<{
  title: string
  intro: string
  loadingLabel: string
  saveLabel: string
  savingLabel: string
  fields: SkillSystemPropertyFieldView[]
  loading: boolean
  saving: boolean
  canSave: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update-field': [key: string, value: string]
  save: []
}>()
</script>

<style scoped>
.skill-setup-form {
  margin-bottom: 12px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--color-warning-500) 35%, var(--ui-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-warning-500) 6%, var(--ui-bg-elevated));
}

.skill-setup-form__header {
  margin-bottom: 12px;
}

.skill-setup-form__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.skill-setup-form__intro {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.skill-setup-form__loading {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.skill-setup-form__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-setup-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-setup-form__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text);
}

.skill-setup-form__input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.skill-setup-form__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--color-primary-500) 50%, var(--ui-border));
}

.skill-setup-form__hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--ui-text-muted);
}

.skill-setup-form__error {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--color-error-600, #dc2626);
}

.skill-setup-form__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.skill-setup-form__save {
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--color-primary-600, #2563eb);
  cursor: pointer;
}

.skill-setup-form__save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
