<template>
  <div
    v-if="viewActionGroups.length > 0"
    class="view-header-actions"
  >
    <template v-for="(group, groupIndex) in viewActionGroups" :key="groupIndex">
      <div
        v-if="group.session"
        class="view-header-actions__session-group"
        role="group"
        aria-label="Session controls"
      >
        <template v-for="action in group.actions" :key="action.id">
          <div
            v-if="action.kind === 'menu'"
            class="view-header-actions__menu"
          >
            <AppIconTooltip :text="action.tooltip">
              <button
                :ref="setConversationMenuBtnRef"
                type="button"
                class="cp-icon-btn view-header-actions__btn"
                :class="{ 'cp-icon-btn--on': conversationMenuOpen }"
                :aria-label="action.ariaLabel || action.tooltip"
                aria-haspopup="menu"
                :aria-expanded="conversationMenuOpen"
                :disabled="action.disabled"
                @click.stop="toggleConversationMenu"
              >
                <UIcon class="cp-icon-btn__glyph" :name="action.icon" />
              </button>
            </AppIconTooltip>
            <div
              v-if="conversationMenuOpen"
              ref="conversationMenuEl"
              class="view-header-actions__dropdown"
              role="menu"
              aria-label="Conversations for this pane"
            >
              <button
                v-for="option in action.options"
                :key="option.id"
                type="button"
                class="view-header-actions__menu-item"
                :class="{
                  'view-header-actions__menu-item--active':
                    option.id === action.selectedId,
                }"
                role="menuitemradio"
                :aria-checked="option.id === action.selectedId"
                @click="onPickConversation(action, option.id)"
              >
                <span class="view-header-actions__menu-item-label">{{
                  option.label
                }}</span>
                <UIcon
                  v-if="option.id === action.selectedId"
                  name="i-lucide-check"
                  class="view-header-actions__menu-item-check"
                />
              </button>
            </div>
          </div>
          <AppIconTooltip v-else :text="action.tooltip">
            <button
              type="button"
              class="cp-icon-btn view-header-actions__btn"
              :class="{
                'cp-icon-btn--on': action.active,
                'view-header-actions__btn--accent': action.accent,
              }"
              :aria-label="action.ariaLabel || action.tooltip"
              :disabled="action.disabled"
              @click="action.onClick()"
            >
              <UIcon class="cp-icon-btn__glyph" :name="action.icon" />
            </button>
          </AppIconTooltip>
        </template>
      </div>
      <template v-else>
        <template v-for="action in group.actions" :key="action.id">
          <AppIconTooltip v-if="action.kind !== 'menu'" :text="action.tooltip">
            <button
              type="button"
              class="cp-icon-btn view-header-actions__btn"
              :class="{
                'cp-icon-btn--on': action.active,
                'view-header-actions__btn--accent': action.accent,
              }"
              :aria-label="action.ariaLabel || action.tooltip"
              :disabled="action.disabled"
              @click="action.onClick()"
            >
              <UIcon class="cp-icon-btn__glyph" :name="action.icon" />
            </button>
          </AppIconTooltip>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  useTitleBarChatControls,
  type TitleBarViewMenuAction,
} from '@renderer/composables/useTitleBarChatControls'
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'

const chatControls = useTitleBarChatControls()
const viewActions = computed(() => chatControls.viewActions)

const conversationMenuOpen = ref(false)
const conversationMenuBtnRef = ref<HTMLElement | null>(null)
const conversationMenuEl = ref<HTMLElement | null>(null)

function setConversationMenuBtnRef(el: unknown) {
  conversationMenuBtnRef.value = el instanceof HTMLElement ? el : null
}

type ViewActionGroup = {
  session: boolean
  actions: typeof chatControls.viewActions
}

const viewActionGroups = computed((): ViewActionGroup[] => {
  const groups: ViewActionGroup[] = []
  for (const action of viewActions.value) {
    const isSession = action.group === 'session'
    const last = groups[groups.length - 1]
    if (last && last.session === isSession) {
      last.actions.push(action)
    } else {
      groups.push({ session: isSession, actions: [action] })
    }
  }
  return groups
})

function toggleConversationMenu() {
  conversationMenuOpen.value = !conversationMenuOpen.value
}

function closeConversationMenu() {
  conversationMenuOpen.value = false
}

function onPickConversation(action: TitleBarViewMenuAction, conversationId: string) {
  closeConversationMenu()
  action.onSelect(conversationId)
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!conversationMenuOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (conversationMenuBtnRef.value?.contains(target)) return
  if (conversationMenuEl.value?.contains(target)) return
  closeConversationMenu()
}

watch(
  () => viewActions.value.length,
  (length) => {
    if (length === 0) closeConversationMenu()
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<style scoped>
.view-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
  min-width: 0;
}

.view-header-actions__session-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 1px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--ui-text) 10%, transparent);
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
}

.view-header-actions__menu {
  position: relative;
}

.view-header-actions__dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 220px;
  max-width: min(360px, 70vw);
  max-height: min(360px, 50vh);
  overflow: auto;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow: 0 10px 28px color-mix(in srgb, #000 18%, transparent);
}

.view-header-actions__menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.35;
}

.view-header-actions__menu-item:hover {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.view-header-actions__menu-item--active {
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
}

.view-header-actions__menu-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-header-actions__menu-item-check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary-500);
}

.view-header-actions :deep(.view-header-actions__btn) {
  min-width: 26px;
  min-height: 26px;
  padding: 0 6px;
  border-radius: 7px;
  box-shadow: none;
}

.view-header-actions__session-group :deep(.view-header-actions__btn) {
  min-width: 26px;
  min-height: 24px;
}

.view-header-actions :deep(.view-header-actions__btn .cp-icon-btn__glyph) {
  width: 15px;
  height: 15px;
}

.view-header-actions :deep(.view-header-actions__btn:hover:not(:disabled)) {
  box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary-500) 10%, transparent);
}

.view-header-actions :deep(.view-header-actions__btn:focus-visible) {
  box-shadow:
    0 0 0 2px var(--ui-bg, #fff),
    0 0 0 4px color-mix(in srgb, var(--color-primary-500) 24%, transparent);
}

.view-header-actions :deep(.view-header-actions__btn--accent) {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
}

.view-header-actions :deep(.view-header-actions__btn--accent:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
}
</style>
