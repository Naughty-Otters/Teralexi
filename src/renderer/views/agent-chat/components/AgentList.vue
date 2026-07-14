<template>
  <div v-if="!collapsed" class="sidebar-actions">
    <button
      type="button"
      class="new-session-btn"
      title="Start a new blank session"
      @click="startNewSession"
    >
      <UIcon name="i-lucide-square-plus" class="new-session-btn__icon" />
      <span>New blank session</span>
    </button>
  </div>
  <button
    v-else
    type="button"
    class="new-session-btn new-session-btn--collapsed"
    title="Start a new blank session"
    aria-label="Start a new blank session"
    @click="startNewSession"
  >
    <UIcon name="i-lucide-square-plus" class="new-session-btn__icon" />
  </button>
  <div v-if="!collapsed" class="sidebar-section-header">
    <div class="sidebar-section-label">Conversations</div>
    <div ref="groupByMenuRoot" class="conversation-groupby">
      <button
        type="button"
        class="conversation-groupby-btn"
        :class="{ 'conversation-groupby-btn--active': groupByMenuOpen }"
        :title="groupByButtonTitle"
        aria-label="Organize conversation list"
        aria-haspopup="menu"
        :aria-expanded="groupByMenuOpen"
        @click.stop="toggleGroupByMenu"
      >
        <UIcon name="i-lucide-layers" class="conversation-groupby-btn__icon" />
      </button>
      <div
        v-if="groupByMenuOpen"
        class="conversation-groupby-menu"
        role="menu"
        aria-label="Organize conversations"
      >
        <button
          v-for="option in groupByOptions"
          :key="option.value"
          type="button"
          class="conversation-groupby-menu__option"
          :class="{
            'conversation-groupby-menu__option--active':
              groupByMode === option.value,
          }"
          role="menuitemradio"
          :aria-checked="groupByMode === option.value"
          @click="selectGroupBy(option.value)"
        >
          <UIcon
            :name="
              groupByMode === option.value
                ? 'i-lucide-check'
                : 'i-lucide-circle'
            "
            class="conversation-groupby-menu__check"
            :class="{
              'conversation-groupby-menu__check--empty':
                groupByMode !== option.value,
            }"
          />
          {{ option.label }}
        </button>
      </div>
    </div>
  </div>
  <ul
    v-if="isConversationListLoading"
    class="agent-list agent-list--loading"
    :class="{ 'agent-list--collapsed': collapsed }"
    role="status"
    aria-live="polite"
    :aria-label="t.startup.loadingConversations"
  >
    <li v-if="!collapsed" class="agent-list-loading">
      <UIcon
        name="i-lucide-loader-circle"
        class="agent-list-loading__icon"
        aria-hidden="true"
      />
      <span class="agent-list-loading__text">{{ t.startup.loadingConversations }}</span>
    </li>
    <li
      v-for="index in 3"
      v-show="!collapsed"
      :key="`skeleton-${index}`"
      class="agent-list-skeleton"
      aria-hidden="true"
    >
      <span class="agent-list-skeleton__avatar" />
      <span class="agent-list-skeleton__lines">
        <span class="agent-list-skeleton__line agent-list-skeleton__line--title" />
        <span class="agent-list-skeleton__line agent-list-skeleton__line--meta" />
      </span>
    </li>
    <li v-if="collapsed" class="agent-list-loading agent-list-loading--collapsed">
      <UIcon
        name="i-lucide-loader-circle"
        class="agent-list-loading__icon"
        aria-hidden="true"
      />
      <span class="sr-only">{{ t.startup.loadingConversations }}</span>
    </li>
  </ul>
  <ul
    v-else
    class="agent-list"
    :class="{ 'agent-list--collapsed': collapsed }"
  >
    <template v-for="group in conversationGroups" :key="group.key">
      <li
        v-if="showGroupHeaders"
        class="conversation-group"
        :title="group.key === NO_WORKSPACE_GROUP_KEY ? undefined : group.key"
      >
        <button
          type="button"
          class="conversation-group-toggle"
          :aria-expanded="isGroupExpanded(group.key)"
          :aria-label="
            isGroupExpanded(group.key)
              ? `Collapse ${group.label}`
              : `Expand ${group.label}`
          "
          @click="toggleGroupExpanded(group.key)"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="conversation-group-toggle__chevron"
            :class="{
              'conversation-group-toggle__chevron--open': isGroupExpanded(
                group.key,
              ),
            }"
            aria-hidden="true"
          />
          <span class="conversation-group-toggle__text">{{ group.label }}</span>
          <span class="conversation-group-toggle__count">{{
            group.items.length
          }}</span>
        </button>
      </li>
      <li
        v-for="conv in group.items"
        v-show="!showGroupHeaders || isGroupExpanded(group.key)"
        :key="conv.id"
        :ref="(el) => setConversationItemRef(el, conv.id)"
        class="agent-item"
        :class="{
          'agent-item--active': isActiveConversation(conv.id),
          'agent-item--collapsed': collapsed,
          'agent-item--nested': showGroupHeaders,
          'agent-item--menu-open': openMenuId === conv.id,
        }"
        :data-conversation-id="conv.id"
        :aria-current="isActiveConversation(conv.id) ? 'true' : undefined"
        @click="openConversation(conv.id, conv.agentId)"
      >
        <UAvatar
          :alt="agentName(conv.agentId)"
          size="sm"
          :color="agentColor(conv.agentId)"
          :class="{ 'agent-item-avatar--active': isActiveConversation(conv.id) }"
          :ui="{ fallback: 'font-bold text-xs' }"
        />
        <div v-if="!collapsed" class="agent-item-info">
          <p class="agent-item-name">{{ conv.title }}</p>
          <p class="agent-item-desc">{{ conversationMetaLine(conv) }}</p>
        </div>
        <span v-if="msgCount(conv.id) > 0 && !collapsed" class="msg-badge">
          {{ msgCount(conv.id) }}
        </span>
        <div
          v-if="!collapsed && canDelete(conv.id)"
          :ref="(el) => setMenuRoot(el, conv.id)"
          class="agent-item-actions"
          @click.stop
        >
          <button
            type="button"
            class="agent-item-menu-btn"
            :class="{ 'agent-item-menu-btn--active': openMenuId === conv.id }"
            title="Conversation actions"
            aria-label="Conversation actions"
            aria-haspopup="menu"
            :aria-expanded="openMenuId === conv.id"
            @click="toggleMenu(conv.id)"
          >
            <UIcon name="i-lucide-ellipsis" class="agent-item-menu-btn__icon" />
          </button>
          <div
            v-if="openMenuId === conv.id"
            class="agent-item-menu"
            role="menu"
            aria-label="Conversation actions"
          >
            <button
              type="button"
              class="agent-item-menu__option agent-item-menu__option--danger"
              role="menuitem"
              @click="confirmDelete(conv)"
            >
              <UIcon name="i-lucide-trash-2" class="agent-item-menu__option-icon" />
              Delete conversation
            </button>
          </div>
        </div>
      </li>
    </template>
    <li v-if="conversationItems.length === 0 && !collapsed" class="empty-item">
      No conversations yet.
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAgentStore, type Conversation } from '@store/agent'
import { useI18n } from '@renderer/composables/useI18n'
import { canDeleteConversationFromUi } from '@shared/conversation/session-id'
import {
  LAYOUT_PREF_KEYS,
  readStoredBooleanMap,
  readStoredString,
  writeStoredBooleanMap,
  writeStoredString,
} from '@renderer/lib/layout-preferences'
import {
  groupConversations,
  NO_WORKSPACE_GROUP_KEY,
  parseConversationListGroupBy,
  type ConversationListGroupBy,
} from '../lib/conversation-list-groups'
import { clearConversationSession } from '../conversation-chat-session'

const emit = defineEmits<{ 'navigate-chat': [] }>()
const props = defineProps<{ collapsed?: boolean }>()

const agentStore = useAgentStore()
const { t } = useI18n()
const toast = useToast()
const openMenuId = ref<string | null>(null)
const menuRoots = new Map<string, HTMLElement>()
const conversationItemRefs = new Map<string, HTMLElement>()
const groupByMenuOpen = ref(false)
const groupByMenuRoot = ref<HTMLElement | null>(null)
const groupByMode = ref<ConversationListGroupBy>(
  parseConversationListGroupBy(
    readStoredString(LAYOUT_PREF_KEYS.conversationListGroupBy),
  ),
)
/** Keys stored as `${mode}::${groupKey}` marked collapsed (absent = expanded). */
const collapsedGroups = ref<Record<string, boolean>>(
  readStoredBooleanMap(LAYOUT_PREF_KEYS.conversationListCollapsedGroups),
)

const groupByOptions: Array<{ value: ConversationListGroupBy; label: string }> =
  [
    { value: 'none', label: 'No grouping' },
    { value: 'agent', label: 'Group by agent' },
    { value: 'workspace', label: 'Group by workspace' },
  ]

const conversationItems = computed((): Conversation[] => {
  return Object.values(agentStore.conversationList)
    .flat()
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
})

const conversationGroups = computed(() =>
  groupConversations(
    conversationItems.value,
    props.collapsed ? 'none' : groupByMode.value,
    agentName,
  ),
)

const showGroupHeaders = computed(
  () => !props.collapsed && groupByMode.value !== 'none',
)

const groupByButtonTitle = computed(() => {
  const current =
    groupByOptions.find((o) => o.value === groupByMode.value)?.label ??
    'No grouping'
  return `Organize list (${current})`
})

const isConversationListLoading = computed(
  () =>
    agentStore.isLoadingInitialConversations ||
    !agentStore.hasLoadedInitialConversations,
)

watch(groupByMode, (mode) => {
  writeStoredString(LAYOUT_PREF_KEYS.conversationListGroupBy, mode)
})

watch(
  collapsedGroups,
  (value) => {
    writeStoredBooleanMap(
      LAYOUT_PREF_KEYS.conversationListCollapsedGroups,
      value,
    )
  },
  { deep: true },
)

function collapsedGroupStorageKey(groupKey: string): string {
  return `${groupByMode.value}::${groupKey}`
}

function isGroupExpanded(groupKey: string): boolean {
  return collapsedGroups.value[collapsedGroupStorageKey(groupKey)] !== true
}

function toggleGroupExpanded(groupKey: string) {
  const storageKey = collapsedGroupStorageKey(groupKey)
  const next = { ...collapsedGroups.value }
  if (next[storageKey]) {
    delete next[storageKey]
  } else {
    next[storageKey] = true
  }
  collapsedGroups.value = next
}

function ensureActiveConversationGroupExpanded() {
  if (!showGroupHeaders.value) return
  const activeId = agentStore.currentConversationId
  if (!activeId) return
  const group = conversationGroups.value.find((g) =>
    g.items.some((item) => item.id === activeId),
  )
  if (!group || isGroupExpanded(group.key)) return
  const storageKey = collapsedGroupStorageKey(group.key)
  const next = { ...collapsedGroups.value }
  delete next[storageKey]
  collapsedGroups.value = next
}
function setMenuRoot(el: unknown, conversationId: string) {
  if (el instanceof HTMLElement) {
    menuRoots.set(conversationId, el)
  } else {
    menuRoots.delete(conversationId)
  }
}

function setConversationItemRef(el: unknown, conversationId: string) {
  if (el instanceof HTMLElement) {
    conversationItemRefs.set(conversationId, el)
  } else {
    conversationItemRefs.delete(conversationId)
  }
}

function isActiveConversation(conversationId: string): boolean {
  return agentStore.currentConversationId === conversationId
}

async function scrollActiveConversationIntoView(): Promise<void> {
  const activeId = agentStore.currentConversationId
  if (!activeId || props.collapsed) return
  ensureActiveConversationGroupExpanded()
  await nextTick()
  conversationItemRefs.get(activeId)?.scrollIntoView({ block: 'nearest' })
}

function canDelete(conversationId: string): boolean {
  return canDeleteConversationFromUi(conversationId)
}

function toggleMenu(conversationId: string) {
  groupByMenuOpen.value = false
  openMenuId.value = openMenuId.value === conversationId ? null : conversationId
}

function closeMenu() {
  openMenuId.value = null
}

function toggleGroupByMenu() {
  openMenuId.value = null
  groupByMenuOpen.value = !groupByMenuOpen.value
}

function selectGroupBy(mode: ConversationListGroupBy) {
  groupByMode.value = mode
  groupByMenuOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (openMenuId.value) {
    const root = menuRoots.get(openMenuId.value)
    if (root && !root.contains(target)) {
      closeMenu()
    }
  }
  if (
    groupByMenuOpen.value &&
    groupByMenuRoot.value &&
    !groupByMenuRoot.value.contains(target)
  ) {
    groupByMenuOpen.value = false
  }
}

async function confirmDelete(conv: Conversation) {
  closeMenu()
  const isChannel = conv.type === 'channel'
  const ok = window.confirm(
    isChannel
      ? `Delete "${conv.title}"? Messages and sandbox data will be removed. The next message from this channel contact will start a fresh conversation.`
      : `Delete "${conv.title}"? This removes the conversation, all messages, and sandbox data. This cannot be undone.`,
  )
  if (!ok) return

  clearConversationSession(conv.id)
  await agentStore.deleteConversation(conv.id)
  toast.add({
    title: 'Conversation deleted',
    description: conv.title,
    color: 'neutral',
  })
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  void scrollActiveConversationIntoView()
})

watch(
  () => agentStore.currentConversationId,
  () => {
    void scrollActiveConversationIntoView()
  },
)

watch(
  () => agentStore.hasLoadedInitialConversations,
  (loaded) => {
    if (loaded) {
      void scrollActiveConversationIntoView()
    }
  },
)

watch(
  () => agentStore.isLoadingInitialConversations,
  (loading, wasLoading) => {
    if (wasLoading && !loading) {
      void scrollActiveConversationIntoView()
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})

async function openConversation(conversationId: string, agentId: string) {
  await agentStore.selectConversation(conversationId)
  emit('navigate-chat')
}

async function startNewSession() {
  const conv = await agentStore.createNewConversation(undefined, { mode: 'fresh' })
  if (!conv) return
  await agentStore.selectConversation(conv.id)
  emit('navigate-chat')
}

function sessionLabel(conv: Conversation): string {
  if (conv.type === 'channel') return 'Channel'
  if (conv.type === 'scheduler') return 'Scheduler'
  return 'Chat'
}

function agentName(agentId: string): string {
  return agentStore.agents.find((a) => a.id === agentId)?.name ?? 'Agent'
}

function agentColor(agentId: string) {
  return agentStore.agents.find((a) => a.id === agentId)?.color ?? 'neutral'
}

function msgCount(conversationId: string): number {
  return agentStore.conversations?.[conversationId]?.length ?? 0
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function conversationMetaLine(conv: Conversation): string {
  const parts = [sessionLabel(conv)]
  if (groupByMode.value !== 'agent') {
    parts.push(agentName(conv.agentId))
  }
  parts.push(formatTime(conv.updatedAt))
  return parts.join(' · ')
}
</script>

<style scoped>
.sidebar-actions {
  padding: 12px 12px 6px;
}
.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed var(--ui-border);
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.new-session-btn:hover {
  background: var(--ui-bg-accented);
  border-color: var(--color-primary-500);
}
.new-session-btn--collapsed {
  width: 36px;
  height: 36px;
  margin: 10px auto 8px;
  padding: 0;
  border-style: solid;
}
.new-session-btn__icon {
  width: 16px;
  height: 16px;
}
.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-right: 10px;
}
.sidebar-section-label {
  padding: 12px 14px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
.conversation-groupby {
  position: relative;
  flex-shrink: 0;
}
.conversation-groupby-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}
.conversation-groupby-btn:hover,
.conversation-groupby-btn--active {
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  color: var(--ui-text);
}
.conversation-groupby-btn__icon {
  width: 14px;
  height: 14px;
}
.conversation-groupby-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 40;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow:
    0 4px 6px color-mix(in srgb, var(--ui-text) 8%, transparent),
    0 12px 28px color-mix(in srgb, var(--ui-text) 14%, transparent);
}
.conversation-groupby-menu__option {
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
.conversation-groupby-menu__option:hover,
.conversation-groupby-menu__option--active {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}
.conversation-groupby-menu__check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary-500, var(--ui-primary));
}
.conversation-groupby-menu__check--empty {
  opacity: 0;
}
.conversation-group {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
}
.conversation-group-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 8px 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.conversation-group-toggle:hover {
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
  color: var(--ui-text);
}
.conversation-group-toggle__chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  transition: transform 0.12s ease;
}
.conversation-group-toggle__chevron--open {
  transform: rotate(90deg);
}
.conversation-group-toggle__text {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conversation-group-toggle__count {
  flex-shrink: 0;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--ui-text-muted) 80%, transparent);
}
.agent-item--nested {
  margin-left: 12px;
  padding-left: 8px;
  width: calc(100% - 12px);
  box-sizing: border-box;
  border-left: 1px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
  border-radius: 0 8px 8px 0;
}
.agent-item--nested.agent-item--active {
  box-shadow: inset 3px 0 0 var(--color-primary-500, var(--ui-primary));
}
.agent-list--loading {
  pointer-events: none;
}
.agent-list-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px;
  color: var(--ui-text-muted);
  font-size: 12px;
}
.agent-list-loading--collapsed {
  justify-content: center;
  padding: 12px 0;
}
.agent-list-loading__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  animation: agent-list-loading-spin 0.9s linear infinite;
}
.agent-list-loading__text {
  min-width: 0;
}
.agent-list-skeleton {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px 9px 12px;
  margin-bottom: 2px;
}
.agent-list-skeleton__avatar,
.agent-list-skeleton__line {
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 0%,
    color-mix(in srgb, var(--ui-text) 10%, var(--ui-bg-accented)) 50%,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 100%
  );
  background-size: 200% 100%;
  animation: agent-list-skeleton-shimmer 1.2s ease-in-out infinite;
}
.agent-list-skeleton__avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}
.agent-list-skeleton__lines {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.agent-list-skeleton__line {
  display: block;
  height: 10px;
  border-radius: 4px;
}
.agent-list-skeleton__line--title {
  width: 72%;
}
.agent-list-skeleton__line--meta {
  width: 48%;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@keyframes agent-list-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes agent-list-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
.agent-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
  list-style: none;
  margin: 0;
}
.agent-list--collapsed {
  padding: 8px 0;
}
.agent-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;
  margin-bottom: 2px;
  border: 1px solid transparent;
}
.agent-item:hover {
  background: var(--ui-bg-accented);
}
.agent-item--active {
  background: color-mix(in srgb, var(--color-primary-500, var(--ui-primary)) 14%, var(--ui-bg));
  border-color: color-mix(in srgb, var(--color-primary-500, var(--ui-primary)) 28%, var(--ui-border));
  box-shadow: inset 3px 0 0 var(--color-primary-500, var(--ui-primary));
}
.agent-item--active:hover {
  background: color-mix(in srgb, var(--color-primary-500, var(--ui-primary)) 18%, var(--ui-bg));
}
.agent-item--active .agent-item-name {
  color: var(--color-primary-500, var(--ui-primary));
  font-weight: 600;
}
.agent-item--active .agent-item-desc {
  color: color-mix(in srgb, var(--color-primary-500, var(--ui-primary)) 72%, var(--ui-text-muted));
}
.agent-item--collapsed {
  justify-content: center;
  padding: 8px 0;
  border-color: transparent;
  box-shadow: none;
}
.agent-item-avatar--active :deep(span) {
  box-shadow:
    0 0 0 2px var(--ui-bg),
    0 0 0 3px var(--color-primary-500, var(--ui-primary));
}
.agent-item-info {
  flex: 1;
  min-width: 0;
}
.agent-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0 1px;
}
.agent-item-desc {
  font-size: 11px;
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  font-family: var(--app-font-family);
}
.msg-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-primary-500);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-item-actions {
  position: relative;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
}

.agent-item:hover .agent-item-actions,
.agent-item--menu-open .agent-item-actions {
  opacity: 1;
  pointer-events: auto;
}

.agent-item-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.agent-item-menu-btn:hover,
.agent-item-menu-btn--active {
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  color: var(--ui-text);
}

.agent-item-menu-btn__icon {
  width: 16px;
  height: 16px;
}

.agent-item-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow:
    0 4px 6px color-mix(in srgb, var(--ui-text) 8%, transparent),
    0 12px 28px color-mix(in srgb, var(--ui-text) 14%, transparent);
}

.agent-item-menu__option {
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

.agent-item-menu__option-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.agent-item-menu__option--danger {
  color: var(--color-error-600, #dc2626);
}

.agent-item-menu__option--danger:hover {
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 12%, transparent);
}

.empty-item {
  font-size: 12px;
  color: var(--ui-text-muted);
  padding: 10px 12px;
}
</style>
