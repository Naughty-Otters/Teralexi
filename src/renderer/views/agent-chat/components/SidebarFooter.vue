<template>
  <div class="sidebar-footer">
    <hr class="sidebar-footer-rule" aria-hidden="true" />
    <div class="footer-actions">
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
          <UIcon
            v-if="!props.isSignedIn"
            name="i-lucide-lock"
            class="footer-btn-lock"
            aria-hidden="true"
          />
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
            v-if="!props.isSignedIn"
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
</template>

<script setup lang="ts">
import { useAgentStore } from '@store/agent'
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'
import { useTheme } from '@renderer/composables/useTheme'
import { useI18n } from '@renderer/composables/useI18n'
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
    isSignedIn?: boolean
  }>(),
  {
    isSignedIn: false,
  },
)
const emit = defineEmits<{
  'toggle-settings': []
  'open-monitor': []
  'open-setup-wizard': []
}>()

const agentStore = useAgentStore()
const { isDark, toggle } = useTheme()

function cycleChatBoxMode() {
  const next = cycleChatBoxDisplayMode(agentStore.chatBoxDisplayMode)
  agentStore.chatBoxDisplayMode = next
  persistChatBoxDisplayMode(next)
}

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
.connection-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  margin-bottom: 4px;
}
.connection-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.3s;
}
.connection-dot--ok {
  background: var(--color-success-500, #22c55e);
}
.connection-dot--err {
  background: var(--color-error-500, #ef4444);
}
.connection-dot--idle {
  background: var(--ui-text-muted);
  opacity: 0.4;
}
.connection-label {
  flex: 1;
  font-size: 11px;
  color: var(--ui-text-muted);
}
.footer-actions {
  display: flex;
  gap: 8px;
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
