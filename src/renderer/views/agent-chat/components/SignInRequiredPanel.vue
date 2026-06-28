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
        <svg class="sign-in-gate__google-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {{ loading ? t.auth.signingIn : t.auth.signInWithGoogle }}
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

.sign-in-gate__google-icon {
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
