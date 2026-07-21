<template>
  <div class="sidebar-footer">
    <hr class="sidebar-footer-rule" aria-hidden="true" />
    <div class="footer-actions" :class="{ 'footer-actions--collapsed': collapsed }">
      <div ref="profileMenuRoot" class="footer-profile">
        <button
          type="button"
          class="footer-profile-btn"
          :class="{ 'footer-profile-btn--active': profileMenuOpen }"
          :aria-label="profileButtonAriaLabel"
          :title="profileButtonTitle"
          aria-haspopup="menu"
          :aria-expanded="profileMenuOpen"
          :disabled="authLoading"
          @click.stop="toggleProfileMenu"
        >
          <img
            v-if="account?.picture"
            class="footer-profile-avatar"
            :src="account.picture"
            alt=""
            referrerpolicy="no-referrer"
          />
          <span
            v-else-if="account"
            class="footer-profile-avatar footer-profile-avatar--placeholder"
            aria-hidden="true"
          >
            {{ accountInitial }}
          </span>
          <span
            v-else
            class="footer-profile-avatar footer-profile-avatar--signed-out"
            aria-hidden="true"
          >
            <UIcon name="i-lucide-user" class="footer-profile-avatar__icon" />
          </span>
        </button>
        <div
          v-if="profileMenuOpen"
          class="footer-profile-menu"
          role="menu"
          aria-label="Account"
        >
          <div v-if="account" class="footer-profile-menu__header">
            <p class="footer-profile-menu__name">{{ account.name }}</p>
            <p class="footer-profile-menu__email">{{ account.email }}</p>
          </div>
          <p v-else class="footer-profile-menu__hint">
            {{ t.auth.signInRequiredTitle }}
          </p>
          <p v-if="authError" class="footer-profile-menu__error">{{ authError }}</p>
          <button
            v-if="account"
            type="button"
            class="footer-profile-menu__option"
            role="menuitem"
            :disabled="authLoading"
            @click="onSignOut"
          >
            <UIcon name="i-lucide-log-out" class="footer-profile-menu__option-icon" />
            {{ t.settings.panels.actions.signOut }}
          </button>
          <button
            v-else
            type="button"
            class="footer-profile-menu__option"
            role="menuitem"
            :disabled="authLoading"
            @click="onSignIn"
          >
            <UIcon name="i-lucide-log-in" class="footer-profile-menu__option-icon" />
            {{ authLoading ? t.auth.signingIn : t.auth.signIn }}
          </button>
        </div>
      </div>

      <div v-if="!collapsed" class="footer-tools">
        <AppIconTooltip :text="t.sidebar.settings">
          <button
            class="footer-btn"
            :class="{ 'footer-btn--active': rightPanelView === 'settings' }"
            :aria-label="t.sidebar.settings"
            @click="emit('toggle-settings')"
          >
            <UIcon name="i-lucide-settings" class="footer-btn-icon" />
          </button>
        </AppIconTooltip>
        <AppIconTooltip :text="t.sidebar.setupWizard">
          <button
            class="footer-btn"
            :aria-label="t.sidebar.openSetupWizard"
            @click="emit('open-setup-wizard')"
          >
            <UIcon name="i-lucide-wand-sparkles" class="footer-btn-icon" />
          </button>
        </AppIconTooltip>
        <AppIconTooltip
          v-if="showChatBoxDisplayModeToggle"
          :text="`${chatBoxDisplayModeLabel(agentStore.chatBoxDisplayMode)} — ${chatBoxDisplayModeDescription(agentStore.chatBoxDisplayMode)}. Click to change.`"
        >
          <button
            class="footer-btn"
            :class="{ 'footer-btn--active': agentStore.chatBoxDisplayMode !== 'brief' }"
            :aria-label="`${t.sidebar.chatDisplay}: ${chatBoxDisplayModeLabel(agentStore.chatBoxDisplayMode)}. Click to cycle mode.`"
            @click="cycleChatBoxMode"
          >
            <UIcon
              :name="chatBoxDisplayModeIcon(agentStore.chatBoxDisplayMode)"
              class="footer-btn-icon"
            />
          </button>
        </AppIconTooltip>
        <AppIconTooltip :text="t.sidebar.tokenMonitor">
          <button
            class="footer-btn"
            :class="{ 'footer-btn--active': rightPanelView === 'monitor' }"
            :aria-label="t.sidebar.openTokenMonitor"
            @click="emit('open-monitor')"
          >
            <UIcon name="i-lucide-activity" class="footer-btn-icon" />
            <UIcon
              v-if="!isSignedIn"
              name="i-lucide-lock"
              class="footer-btn-lock"
              aria-hidden="true"
            />
          </button>
        </AppIconTooltip>
        <AppIconTooltip
          :text="isDark ? t.sidebar.switchToLight : t.sidebar.switchToDark"
        >
          <button
            class="footer-btn"
            :aria-label="isDark ? t.sidebar.switchToLight : t.sidebar.switchToDark"
            @click="toggle"
          >
            <UIcon
              :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
              class="footer-btn-icon"
            />
          </button>
        </AppIconTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAgentStore } from '@store/agent'
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'
import { useTheme } from '@renderer/composables/useTheme'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import {
  chatBoxDisplayModeDescription,
  chatBoxDisplayModeIcon,
  chatBoxDisplayModeLabel,
  cycleChatBoxDisplayMode,
  isUiChatBoxDisplayModeToggleEnabled,
  persistChatBoxDisplayMode,
} from '../chatBoxDisplayMode'

const { t } = useI18n()
const showChatBoxDisplayModeToggle = isUiChatBoxDisplayModeToggleEnabled()

const props = withDefaults(
  defineProps<{
    rightPanelView: 'chat' | 'settings' | 'monitor' | 'workspace' | 'workflows'
    /** Kept for parent wiring; lock badges use live account state below. */
    isSignedIn?: boolean
    collapsed?: boolean
  }>(),
  {
    isSignedIn: false,
    collapsed: false,
  },
)

const emit = defineEmits<{
  'toggle-settings': []
  'open-monitor': []
  'open-setup-wizard': []
  'profile-menu-open-change': [open: boolean]
}>()

const agentStore = useAgentStore()
const { isDark, toggle } = useTheme()
const {
  account,
  isSignedIn,
  signIn: signInAccount,
  signOut: signOutAccount,
} = useGoogleAccount()

const profileMenuOpen = ref(false)
const profileMenuRoot = ref<HTMLElement | null>(null)
const authLoading = ref(false)
const authError = ref<string | null>(null)

const accountInitial = computed(
  () => account.value?.name?.charAt(0)?.toUpperCase() || 'T',
)

const profileButtonTitle = computed(() =>
  account.value
    ? `${account.value.name}\n${account.value.email}`
    : t.value.auth.signIn,
)

const profileButtonAriaLabel = computed(() =>
  account.value
    ? `Account menu for ${account.value.name}`
    : 'Account menu — sign in',
)

function toggleProfileMenu() {
  authError.value = null
  profileMenuOpen.value = !profileMenuOpen.value
  emit('profile-menu-open-change', profileMenuOpen.value)
}

function closeProfileMenu() {
  if (!profileMenuOpen.value) return
  profileMenuOpen.value = false
  emit('profile-menu-open-change', false)
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!profileMenuOpen.value) return
  const root = profileMenuRoot.value
  if (root && !root.contains(event.target as Node)) {
    closeProfileMenu()
  }
}

async function onSignIn() {
  authLoading.value = true
  authError.value = null
  try {
    const result = await signInAccount()
    if (!result) {
      authError.value = t.value.auth.signInFailed
      return
    }
    closeProfileMenu()
  } catch (e: unknown) {
    authError.value = e instanceof Error ? e.message : String(e)
  } finally {
    authLoading.value = false
  }
}

async function onSignOut() {
  authLoading.value = true
  authError.value = null
  try {
    await signOutAccount()
    closeProfileMenu()
  } catch (e: unknown) {
    authError.value = e instanceof Error ? e.message : String(e)
  } finally {
    authLoading.value = false
  }
}

function cycleChatBoxMode() {
  const next = cycleChatBoxDisplayMode(agentStore.chatBoxDisplayMode)
  agentStore.chatBoxDisplayMode = next
  persistChatBoxDisplayMode(next)
}

watch(
  () => props.collapsed,
  (collapsed) => {
    if (collapsed) closeProfileMenu()
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<style scoped>
.sidebar-footer {
  padding: 8px 12px 12px;
}
.sidebar-footer-rule {
  margin: 0 0 12px;
  border: none;
  border-top: 1px solid var(--ui-border);
}
.footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.footer-actions--collapsed {
  justify-content: center;
}
.footer-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.footer-profile {
  position: relative;
  flex-shrink: 0;
  z-index: 1;
}
.footer-profile:has(.footer-profile-menu) {
  z-index: 4000;
}
.footer-profile-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;
}
.footer-profile-btn:hover,
.footer-profile-btn--active {
  background: var(--ui-bg-accented);
  border-color: color-mix(in srgb, var(--ui-border) 80%, transparent);
}
.footer-profile-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}
.footer-profile-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 18%, transparent);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 700;
}
.footer-profile-avatar--signed-out {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
  color: var(--ui-text-muted);
}
.footer-profile-avatar__icon {
  width: 14px;
  height: 14px;
}
.footer-profile-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 4000;
  min-width: 220px;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow:
    0 4px 6px color-mix(in srgb, var(--ui-text) 8%, transparent),
    0 12px 28px color-mix(in srgb, var(--ui-text) 14%, transparent);
}
.footer-profile-menu__header {
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 4px;
}
.footer-profile-menu__name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer-profile-menu__email {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer-profile-menu__hint {
  margin: 0;
  padding: 8px 10px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 4px;
}
.footer-profile-menu__error {
  margin: 0 0 4px;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--color-error-600, #dc2626);
}
.footer-profile-menu__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.footer-profile-menu__option:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}
.footer-profile-menu__option:disabled {
  opacity: 0.65;
  cursor: wait;
}
.footer-profile-menu__option-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
  color: var(--ui-text-muted);
  transition:
    background 0.12s,
    color 0.12s;
  flex: none;
}
.footer-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}
.footer-btn-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.footer-btn-lock {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 10px;
  height: 10px;
  color: var(--ui-text-muted);
  opacity: 0.85;
}
.footer-btn--active {
  background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  color: var(--color-primary-500);
}
</style>
