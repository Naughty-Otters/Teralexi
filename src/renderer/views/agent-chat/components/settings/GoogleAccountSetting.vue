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
            {{ accountInitial }}
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
          {{ loading ? p.status.signingIn : p.accounts.google.signIn }}
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

const {
  account,
  signIn: signInAccount,
  signOut: signOutAccount,
} = useGoogleAccount()
const loading = ref(false)
const error = ref<string | null>(null)

const accountInitial = computed(
  () => account.value?.name?.charAt(0)?.toUpperCase() || 'T',
)

async function signIn() {
  loading.value = true
  error.value = null
  try {
    const result = await signInAccount()
    if (!result) {
      error.value = t.value.auth.signInFailed
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function signOut() {
  loading.value = true
  try {
    await signOutAccount()
  } finally {
    loading.value = false
  }
}
</script>
