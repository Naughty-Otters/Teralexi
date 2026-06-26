<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.googleWorkspace }}</div>
    <p class="google-workspace-intro">{{ p.googleWorkspace.intro }}</p>

    <div v-if="loading" class="google-workspace-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card google-workspace-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.googleWorkspace.clientIdLabel }}</label>
        <input
          class="sp-input google-workspace-input"
          type="text"
          :value="draft.clientId"
          :placeholder="p.googleWorkspace.clientIdPlaceholder"
          :disabled="saving === 'clientId'"
          spellcheck="false"
          autocomplete="off"
          @input="draft.clientId = ($event.target as HTMLInputElement).value"
          @blur="() => persist('clientId', draft.clientId)"
        />
        <span class="google-workspace-field-hint">{{ p.googleWorkspace.clientIdHint }}</span>
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.googleWorkspace.clientSecretLabel }}</label>
        <input
          class="sp-input sp-key-input google-workspace-input"
          type="password"
          :value="draft.clientSecret"
          :placeholder="p.googleWorkspace.clientSecretPlaceholder"
          :disabled="saving === 'clientSecret'"
          spellcheck="false"
          autocomplete="off"
          @input="draft.clientSecret = ($event.target as HTMLInputElement).value"
          @blur="() => persist('clientSecret', draft.clientSecret)"
        />
        <span class="google-workspace-field-hint">{{ p.googleWorkspace.clientSecretHint }}</span>
      </div>

      <p class="google-workspace-redirect-hint">{{ p.googleWorkspace.redirectUriHint }}</p>

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

        <p v-if="account.workspaceAccess" class="acct-hint">
          {{ p.googleWorkspace.signedInHint }}
        </p>
        <p v-else class="acct-hint acct-hint--warn">
          {{ p.googleWorkspace.missingScopes }}
        </p>

        <button
          class="acct-action-btn acct-action-btn--signout"
          :disabled="signInLoading"
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

        <p class="acct-hint">{{ p.googleWorkspace.signInHint }}</p>

        <p v-if="!oauthConfigured" class="acct-hint acct-hint--warn">
          {{ p.googleWorkspace.oauthNotConfigured }}
        </p>

        <div v-if="error" class="acct-error">{{ error }}</div>

        <button
          class="acct-action-btn"
          :disabled="signInLoading || !oauthConfigured"
          @click="signIn"
        >
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
          {{
            signInLoading
              ? p.status.signingIn
              : p.googleWorkspace.signInWithGoogle
          }}
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED,
  GOOGLE_WORKSPACE_PROP_KEYS,
  LEGACY_GOOGLE_WORKSPACE_PROP_KEYS,
  resolveGoogleWorkspaceCredentialsFromMap,
} from '@shared/google-workspace-settings'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

interface GoogleWorkspaceAccountInfo {
  email: string
  name: string
  picture: string
  workspaceAccess: boolean
}

const loading = ref(true)
const signInLoading = ref(false)
const saving = ref<keyof typeof draft | null>(null)
const account = ref<GoogleWorkspaceAccountInfo | null>(null)
const error = ref<string | null>(null)
const oauthConfigured = ref(false)
const draft = reactive({
  clientId: '',
  clientSecret: '',
})

function resolveSignInError(e: unknown): string {
  if (e instanceof Error && e.message === GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED) {
    return p.value.googleWorkspace.oauthNotConfigured
  }
  return e instanceof Error ? e.message : String(e)
}

async function refreshOAuthConfigured(): Promise<void> {
  const values = await getSystemConfigValues([
    ...Object.values(GOOGLE_WORKSPACE_PROP_KEYS),
    ...Object.values(LEGACY_GOOGLE_WORKSPACE_PROP_KEYS),
  ])
  oauthConfigured.value = Boolean(
    resolveGoogleWorkspaceCredentialsFromMap(values).clientId,
  )
}

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const values = await getSystemConfigValues([
      ...Object.values(GOOGLE_WORKSPACE_PROP_KEYS),
      ...Object.values(LEGACY_GOOGLE_WORKSPACE_PROP_KEYS),
    ])
    const resolved = resolveGoogleWorkspaceCredentialsFromMap(values)
    draft.clientId = resolved.clientId
    draft.clientSecret = resolved.clientSecret
    await refreshOAuthConfigured()
    account.value =
      (await window.ipcRendererChannel?.GetGoogleWorkspaceAccount?.invoke()) ??
      null
  } finally {
    loading.value = false
  }
}

async function persist(
  key: keyof typeof draft,
  value: string,
): Promise<void> {
  saving.value = key
  try {
    await setSystemConfigValue(GOOGLE_WORKSPACE_PROP_KEYS[key], value.trim())
    await refreshOAuthConfigured()
  } finally {
    saving.value = null
  }
}

async function signIn() {
  if (!oauthConfigured.value) {
    error.value = p.value.googleWorkspace.oauthNotConfigured
    return
  }

  signInLoading.value = true
  error.value = null
  try {
    const result =
      await window.ipcRendererChannel?.GoogleWorkspaceSignIn?.invoke()
    account.value = result ?? null
  } catch (e: unknown) {
    error.value = resolveSignInError(e)
  } finally {
    signInLoading.value = false
  }
}

async function signOut() {
  signInLoading.value = true
  try {
    await window.ipcRendererChannel?.GoogleWorkspaceSignOut?.invoke()
    account.value = null
  } finally {
    signInLoading.value = false
  }
}

onMounted(() => {
  void loadSettings()
  window.ipcRendererChannel?.GoogleWorkspaceAccountChanged?.on?.(
    ({ account: next }) => {
      account.value = next
    },
  )
})
</script>

<style scoped>
.google-workspace-intro,
.google-workspace-field-hint,
.google-workspace-redirect-hint {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.google-workspace-field-hint,
.google-workspace-redirect-hint {
  margin: 6px 0 0;
}

.google-workspace-redirect-hint {
  margin-bottom: 0;
}

.google-workspace-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.google-workspace-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.google-workspace-input {
  width: 100%;
}
</style>
