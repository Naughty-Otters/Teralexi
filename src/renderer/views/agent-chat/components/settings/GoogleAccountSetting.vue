<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.googleAccount }}</div>
    <div class="sp-card">
      <template v-if="account">
        <div class="acct-profile">
          <img
            v-if="account.picture"
            class="acct-avatar"
            :src="account.picture"
            alt="Profile picture"
            referrerpolicy="no-referrer"
          />
          <div v-else class="acct-avatar acct-avatar--placeholder">
            {{ account.name?.charAt(0)?.toUpperCase() ?? 'G' }}
          </div>
          <div class="acct-info">
            <span class="acct-name">{{ account.name }}</span>
            <span class="acct-meta">{{ account.email }}</span>
          </div>
        </div>

        <div class="sp-status-row">
          <span class="connection-dot connection-dot--ok" />
          <span class="sp-status-label">{{ p.status.signedIn }}</span>
        </div>

        <p class="acct-hint">{{ p.accounts.google.signedInHint }}</p>

        <button
          class="acct-action-btn acct-action-btn--signout"
          :disabled="loading"
          @click="signOut"
        >
          {{ p.actions.signOut }}
        </button>
      </template>

      <template v-else>
        <div class="sp-status-row">
          <span class="connection-dot connection-dot--idle" />
          <span class="sp-status-label">{{ p.status.notSignedIn }}</span>
        </div>

        <p class="acct-hint">{{ p.accounts.google.signInHint }}</p>

        <div v-if="error" class="acct-error">{{ error }}</div>

        <button class="acct-action-btn" :disabled="loading" @click="signIn">
          <svg class="acct-provider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
          {{ loading ? p.status.signingIn : p.accounts.google.signInWithGoogle }}
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

interface GoogleAccountInfo {
  email: string
  name: string
  picture: string
}

const account = ref<GoogleAccountInfo | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  const stored = await window.ipcRendererChannel?.GetGoogleAccount?.invoke()
  account.value = stored ?? null
  window.ipcRendererChannel?.GoogleAccountChanged?.on?.(({ account: next }) => {
    account.value = next
  })
})

async function signIn() {
  loading.value = true
  error.value = null
  try {
    const result = await window.ipcRendererChannel?.GoogleSignIn?.invoke()
    account.value = result ?? null
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function signOut() {
  loading.value = true
  try {
    await window.ipcRendererChannel?.GoogleSignOut?.invoke()
    account.value = null
  } finally {
    loading.value = false
  }
}
</script>
