<template>
  <div
    v-if="open"
    class="authorization-blocked-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="authorization-blocked-title"
  >
    <div class="authorization-blocked-modal">
      <div class="authorization-blocked-card">
        <div class="authorization-blocked__icon-wrap" aria-hidden="true">
          <UIcon name="i-lucide-shield-alert" class="authorization-blocked__icon" />
        </div>
        <h2 id="authorization-blocked-title" class="authorization-blocked__title">
          {{ t.auth.authorizationBlockedTitle }}
        </h2>
        <p class="authorization-blocked__desc">
          {{ t.auth.authorizationBlockedDesc }}
        </p>
        <p v-if="displayError" class="authorization-blocked__error" role="alert">
          {{ displayError }}
        </p>

        <div class="authorization-blocked__actions">
          <button
            type="button"
            class="authorization-blocked__btn authorization-blocked__btn--primary"
            :disabled="retrying"
            @click="onRetry"
          >
            {{ retrying ? t.auth.authorizationRetrying : t.auth.authorizationRetry }}
          </button>
          <button
            type="button"
            class="authorization-blocked__btn"
            :disabled="retrying"
            @click="onSignInAgain"
          >
            {{ t.auth.authorizationSignInAgain }}
          </button>
          <button
            type="button"
            class="authorization-blocked__btn authorization-blocked__btn--ghost"
            :disabled="retrying"
            @click="onSignOut"
          >
            {{ t.auth.authorizationSignOut }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import { useEntitlement } from '@renderer/composables/useEntitlement'

const props = defineProps<{
  open: boolean
  errorMessage?: string | null
}>()

const { t } = useI18n()
const { signIn, signOut } = useGoogleAccount()
const { refreshFromServer } = useEntitlement()
const retrying = ref(false)
const localError = ref<string | null>(null)
const displayError = computed(
  () => localError.value ?? props.errorMessage ?? null,
)

async function onRetry() {
  retrying.value = true
  localError.value = null
  try {
    await refreshFromServer()
  } catch (err) {
    localError.value =
      err instanceof Error ? err.message : String(err)
  } finally {
    retrying.value = false
  }
}

async function onSignInAgain() {
  retrying.value = true
  localError.value = null
  try {
    await signOut()
    const account = await signIn()
    if (!account) {
      localError.value = t.value.auth.signInFailed
    }
  } catch (err) {
    localError.value =
      err instanceof Error ? err.message : String(err)
  } finally {
    retrying.value = false
  }
}

async function onSignOut() {
  retrying.value = true
  localError.value = null
  try {
    await signOut()
  } finally {
    retrying.value = false
  }
}
</script>

<style scoped>
.authorization-blocked-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(6px);
}

.authorization-blocked-modal {
  width: min(480px, 100%);
}

.authorization-blocked-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 28px 24px;
  border-radius: 16px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
}

.authorization-blocked__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 12%, var(--ui-bg));
  color: var(--color-error-600, #dc2626);
}

.authorization-blocked__icon {
  width: 24px;
  height: 24px;
}

.authorization-blocked__title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 650;
  color: var(--ui-text);
}

.authorization-blocked__desc,
.authorization-blocked__error {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}

.authorization-blocked__error {
  color: var(--color-error-600, #dc2626);
}

.authorization-blocked__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.authorization-blocked__btn {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.authorization-blocked__btn--primary {
  border-color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 10%, var(--ui-bg));
  color: var(--color-primary-700, var(--color-primary-600, var(--ui-text)));
}

.authorization-blocked__btn--ghost {
  background: transparent;
  font-weight: 500;
}

.authorization-blocked__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
