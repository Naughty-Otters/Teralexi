<template>
  <section class="sp-section">
    <div class="sp-section-title">{{ t.settings.sections.googleOAuth }}</div>
    <p class="google-oauth-intro">{{ p.googleOAuth.intro }}</p>

    <div v-if="loading" class="google-oauth-loading">{{ t.common.loading }}</div>

    <div v-else class="sp-card google-oauth-card">
      <div class="sp-field">
        <label class="sp-label">{{ p.googleOAuth.clientIdLabel }}</label>
        <input
          class="sp-input google-oauth-input"
          type="text"
          :value="draft.clientId"
          :placeholder="p.googleOAuth.clientIdPlaceholder"
          :disabled="saving === 'clientId'"
          spellcheck="false"
          autocomplete="off"
          @input="draft.clientId = ($event.target as HTMLInputElement).value"
          @blur="() => persist('clientId', draft.clientId)"
        />
        <span class="google-oauth-field-hint">{{ p.googleOAuth.clientIdHint }}</span>
      </div>

      <div class="sp-field">
        <label class="sp-label">{{ p.googleOAuth.clientSecretLabel }}</label>
        <input
          class="sp-input sp-key-input google-oauth-input"
          type="password"
          :value="draft.clientSecret"
          :placeholder="p.googleOAuth.clientSecretPlaceholder"
          :disabled="saving === 'clientSecret'"
          spellcheck="false"
          autocomplete="off"
          @input="draft.clientSecret = ($event.target as HTMLInputElement).value"
          @blur="() => persist('clientSecret', draft.clientSecret)"
        />
        <span class="google-oauth-field-hint">{{ p.googleOAuth.clientSecretHint }}</span>
      </div>

      <p class="google-oauth-redirect-hint">{{ p.googleOAuth.redirectUriHint }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { GOOGLE_OAUTH_PROP_KEYS } from '@shared/google-oauth-settings'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

const loading = ref(true)
const saving = ref<keyof typeof draft | null>(null)
const draft = reactive({
  clientId: '',
  clientSecret: '',
})

async function loadSettings(): Promise<void> {
  loading.value = true
  try {
    const values = await getSystemConfigValues(
      Object.values(GOOGLE_OAUTH_PROP_KEYS),
    )
    draft.clientId = values[GOOGLE_OAUTH_PROP_KEYS.clientId] ?? ''
    draft.clientSecret = values[GOOGLE_OAUTH_PROP_KEYS.clientSecret] ?? ''
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
    await setSystemConfigValue(GOOGLE_OAUTH_PROP_KEYS[key], value.trim())
  } finally {
    saving.value = null
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<style scoped>
.google-oauth-intro,
.google-oauth-field-hint,
.google-oauth-redirect-hint {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.google-oauth-field-hint,
.google-oauth-redirect-hint {
  margin: 6px 0 0;
}

.google-oauth-redirect-hint {
  margin-bottom: 0;
}

.google-oauth-loading {
  font-size: 13px;
  color: var(--ui-text-muted);
}

.google-oauth-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.google-oauth-input {
  width: 100%;
}
</style>
