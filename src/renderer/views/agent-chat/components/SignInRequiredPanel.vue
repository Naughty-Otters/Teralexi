<template>
  <div class="sign-in-gate">
    <div class="sign-in-gate__card">
      <div class="sign-in-gate__icon-wrap" aria-hidden="true">
        <UIcon name="i-lucide-lock-keyhole" class="sign-in-gate__icon" />
      </div>
      <h2 class="sign-in-gate__title">{{ title }}</h2>
      <p class="sign-in-gate__desc">{{ description }}</p>

      <p v-if="error" class="sign-in-gate__error" role="alert">{{ error }}</p>

      <button
        type="button"
        class="sign-in-gate__btn"
        :disabled="loading"
        @click="onSignIn"
      >
        <UIcon name="i-lucide-log-in" class="sign-in-gate__btn-icon" />
        {{ loading ? t.auth.signingIn : t.auth.signIn }}
      </button>

      <p v-if="hint" class="sign-in-gate__hint">{{ hint }}</p>

      <button
        v-if="secondaryActionLabel"
        type="button"
        class="sign-in-gate__secondary"
        @click="emit('secondary-action')"
      >
        {{ secondaryActionLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    hint?: string | null
    secondaryActionLabel?: string | null
  }>(),
  {
    title: undefined,
    description: undefined,
    hint: null,
    secondaryActionLabel: null,
  },
)

const emit = defineEmits<{
  'signed-in': []
  'secondary-action': []
}>()

const { t } = useI18n()
const { signIn } = useGoogleAccount()
const loading = ref(false)
const error = ref<string | null>(null)

const title = computed(() => props.title ?? t.value.auth.signInRequiredTitle)
const description = computed(
  () => props.description ?? t.value.auth.signInRequiredDesc,
)

async function onSignIn() {
  loading.value = true
  error.value = null
  try {
    const result = await signIn()
    if (result) {
      emit('signed-in')
    } else {
      error.value = t.value.auth.signInFailed
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.sign-in-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px 24px;
  box-sizing: border-box;
}

.sign-in-gate__card {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 28px 24px;
  border-radius: 16px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.06);
}

.sign-in-gate__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-primary-500) 12%, var(--ui-bg));
  color: var(--color-primary-600, var(--color-primary-500));
}

.sign-in-gate__icon {
  width: 24px;
  height: 24px;
}

.sign-in-gate__title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 650;
  color: var(--ui-text);
}

.sign-in-gate__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}

.sign-in-gate__error {
  margin: 0;
  font-size: 13px;
  color: var(--color-error-600, #dc2626);
}

.sign-in-gate__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
  padding: 10px 18px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition:
    border-color 0.12s,
    background 0.12s;
}

.sign-in-gate__btn:hover:not(:disabled) {
  border-color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 6%, var(--ui-bg));
}

.sign-in-gate__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sign-in-gate__btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.sign-in-gate__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.sign-in-gate__secondary {
  margin-top: 2px;
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary-600, var(--color-primary-500));
  cursor: pointer;
  font-family: inherit;
}

.sign-in-gate__secondary:hover {
  text-decoration: underline;
}
</style>
