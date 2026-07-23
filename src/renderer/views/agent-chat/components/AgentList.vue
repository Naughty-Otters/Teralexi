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
    <div class="sidebar-section-actions">
      <div class="conversation-groupby">
        <button
          ref="workspaceTriggerRef"
          type="button"
          class="conversation-groupby-btn"
          :class="{ 'conversation-groupby-btn--active': workspaceMenuOpen }"
          title="New conversation in workspace"
          aria-label="New conversation in workspace"
          aria-haspopup="menu"
          :aria-expanded="workspaceMenuOpen"
          @click.stop="toggleWorkspaceMenu"
        >
          <UIcon
            name="i-lucide-folder-plus"
            class="conversation-groupby-btn__icon"
          />
        </button>
      </div>
      <div class="conversation-groupby">
        <button
          ref="groupByTriggerRef"
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
      </div>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="workspaceMenuOpen"
      ref="workspaceMenuEl"
      class="conversation-groupby-menu conversation-groupby-menu--workspaces"
      :style="workspaceMenuStyle"
      role="menu"
      aria-label="New conversation in workspace"
      @pointerdown.stop
    >
      <div class="conversation-groupby-menu__section-label">
        Existing workspaces
      </div>
      <button
        v-for="workspace in existingWorkspaces"
        :key="workspace.path"
        type="button"
        class="conversation-groupby-menu__option"
        role="menuitem"
        :title="workspace.path"
        @click="startSessionWithWorkspace(workspace.path)"
      >
        <UIcon
          name="i-lucide-folder"
          class="conversation-groupby-menu__check"
        />
        <span class="conversation-groupby-menu__option-text">
          <span class="conversation-groupby-menu__option-title">
            {{ workspace.label }}
          </span>
          <span class="conversation-groupby-menu__option-sub">
            {{ workspace.path }}
          </span>
        </span>
      </button>
      <p
        v-if="existingWorkspaces.length === 0"
        class="conversation-groupby-menu__empty"
      >
        No workspaces yet
      </p>
      <div
        class="conversation-groupby-menu__divider"
        role="separator"
        aria-hidden="true"
      />
      <button
        type="button"
        class="conversation-groupby-menu__option"
        role="menuitem"
        @click="browseWorkspaceAndStartSession"
      >
        <UIcon
          name="i-lucide-folder-search"
          class="conversation-groupby-menu__check"
        />
        Browse…
      </button>
    </div>
    <div
      v-if="groupByMenuOpen"
      ref="groupByMenuEl"
      class="conversation-groupby-menu"
      :style="groupByMenuStyle"
      role="menu"
      aria-label="Organize conversations"
      @pointerdown.stop
    >
      <div class="conversation-groupby-menu__section-label">Group by</div>
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
      <div
        class="conversation-groupby-menu__divider"
        role="separator"
        aria-hidden="true"
      />
      <div class="conversation-groupby-menu__section-label">Show on item</div>
      <button
        v-for="option in labelFieldOptions"
        :key="option.value"
        type="button"
        class="conversation-groupby-menu__option"
        :class="{
          'conversation-groupby-menu__option--active':
            itemLabels[option.value],
        }"
        role="menuitemcheckbox"
        :aria-checked="itemLabels[option.value]"
        @click="toggleItemLabel(option.value)"
      >
        <UIcon
          :name="
            itemLabels[option.value]
              ? 'i-lucide-square-check'
              : 'i-lucide-square'
          "
          class="conversation-groupby-menu__check"
          :class="{
            'conversation-groupby-menu__check--off':
              !itemLabels[option.value],
          }"
        />
        {{ option.label }}
      </button>
    </div>
  </Teleport>
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
        class="agent-item-host"
        :data-conversation-id="conv.id"
      >
        <AppIconTooltip
          block
          :delay-duration="350"
          :content="conversationTooltipContent"
        >
          <template #content>
            <div
              v-if="conversationTooltipModelById[conv.id]"
              class="app-icon-tooltip__detail"
            >
              <p class="app-icon-tooltip__detail-title">
                {{ conversationTooltipModelById[conv.id]!.title }}
              </p>
              <dl class="app-icon-tooltip__detail-rows">
                <div
                  v-for="row in conversationTooltipModelById[conv.id]!.rows"
                  :key="row.label"
                  class="app-icon-tooltip__detail-row"
                >
                  <dt class="app-icon-tooltip__detail-label">{{ row.label }}</dt>
                  <dd class="app-icon-tooltip__detail-value">{{ row.value }}</dd>
                </div>
              </dl>
            </div>
          </template>
          <div
            class="agent-item"
            :class="{
              'agent-item--active': isActiveConversation(conv.id),
              'agent-item--collapsed': collapsed,
              'agent-item--nested': showGroupHeaders,
            }"
            role="button"
            tabindex="0"
            :aria-current="isActiveConversation(conv.id) ? 'true' : undefined"
            @click="openConversation(conv.id, conv.agentId)"
            @keydown.enter.prevent="openConversation(conv.id, conv.agentId)"
            @keydown.space.prevent="openConversation(conv.id, conv.agentId)"
          >
            <UAvatar
              :alt="agentName(conv.agentId)"
              size="sm"
              :color="agentColor(conv.agentId)"
              :class="{
                'agent-item-avatar--active': isActiveConversation(conv.id),
              }"
              :ui="{ fallback: 'font-bold text-xs' }"
            />
            <div v-if="!collapsed" class="agent-item-info">
              <p class="agent-item-name">{{ conv.title }}</p>
              <p
                v-if="conversationMetaById[conv.id]"
                class="agent-item-desc"
              >
                {{ conversationMetaById[conv.id] }}
              </p>
            </div>
            <span v-if="msgCount(conv.id) > 0 && !collapsed" class="msg-badge">
              {{ msgCount(conv.id) }}
            </span>
            <div
              v-if="!collapsed && canDelete(conv.id)"
              class="agent-item-actions"
              role="toolbar"
              aria-label="Conversation actions"
              @click.stop
            >
              <button
                type="button"
                class="agent-item-action-btn agent-item-action-btn--danger"
                title="Delete conversation"
                aria-label="Delete conversation"
                @click="openDeleteDialog(conv)"
              >
                <UIcon
                  name="i-lucide-trash-2"
                  class="agent-item-action-btn__icon"
                />
              </button>
            </div>
          </div>
        </AppIconTooltip>
      </li>
    </template>
    <li v-if="conversationItems.length === 0 && !collapsed" class="empty-item">
      No conversations yet.
    </li>
  </ul>

  <Teleport to="body">
    <div
      v-if="showDeleteDialog"
      class="conversation-delete-backdrop"
      role="presentation"
      @click.self="closeDeleteDialog"
    >
      <div
        class="conversation-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="deleteDialogTitleId"
        :aria-describedby="deleteDialogMessageId"
      >
        <h3 :id="deleteDialogTitleId" class="conversation-delete-dialog__title">
          {{ t.chat.deleteConversationDialog.title }}
        </h3>
        <p
          :id="deleteDialogMessageId"
          class="conversation-delete-dialog__message"
        >
          {{ deleteDialogMessage }}
        </p>
        <div class="conversation-delete-dialog__actions">
          <button
            type="button"
            class="conversation-delete-dialog__btn"
            :disabled="deletingConversation"
            @click="closeDeleteDialog"
          >
            {{ t.chat.deleteConversationDialog.cancel }}
          </button>
          <button
            type="button"
            class="conversation-delete-dialog__btn conversation-delete-dialog__btn--danger"
            :disabled="deletingConversation"
            @click="confirmDeleteConversation"
          >
            {{
              deletingConversation
                ? t.chat.deleteConversationDialog.deleting
                : t.chat.deleteConversationDialog.confirm
            }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAgentStore, type Conversation } from '@store/agent'
import { useI18n } from '@renderer/composables/useI18n'
import { canDeleteConversationFromUi } from '@shared/conversation/session-id'
import { workspaceBasename } from '@shared/agent/workspace'
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
import {
  buildConversationDetailTooltipModel,
  buildConversationMetaLine,
  CONVERSATION_LIST_LABEL_OPTIONS,
  formatAgentTypeLabel,
  parseConversationListItemLabels,
  serializeConversationListItemLabels,
  type ConversationDetailTooltipModel,
  type ConversationListItemLabels,
  type ConversationListLabelField,
} from '../lib/conversation-list-item-labels'
import { clearConversationSession } from '../conversation-chat-session'
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'

const emit = defineEmits<{ 'navigate-chat': [] }>()
const props = defineProps<{ collapsed?: boolean }>()

const agentStore = useAgentStore()
const { t } = useI18n()
const toast = useToast()
const conversationItemRefs = new Map<string, HTMLElement>()
const showDeleteDialog = ref(false)
const deletingConversation = ref(false)
const deleteTarget = ref<Conversation | null>(null)
const deleteDialogTitleId = 'conversation-delete-dialog-title'
const deleteDialogMessageId = 'conversation-delete-dialog-message'
const groupByMenuOpen = ref(false)
const groupByTriggerRef = ref<HTMLButtonElement | null>(null)
const groupByMenuEl = ref<HTMLElement | null>(null)
const groupByMenuStyle = ref<Record<string, string>>({})
const workspaceMenuOpen = ref(false)
const workspaceTriggerRef = ref<HTMLButtonElement | null>(null)
const workspaceMenuEl = ref<HTMLElement | null>(null)
const workspaceMenuStyle = ref<Record<string, string>>({})
const groupByMode = ref<ConversationListGroupBy>(
  parseConversationListGroupBy(
    readStoredString(LAYOUT_PREF_KEYS.conversationListGroupBy),
  ),
)
/** Keys stored as `${mode}::${groupKey}` marked collapsed (absent = expanded). */
const collapsedGroups = ref<Record<string, boolean>>(
  readStoredBooleanMap(LAYOUT_PREF_KEYS.conversationListCollapsedGroups),
)
const itemLabels = ref<ConversationListItemLabels>(
  parseConversationListItemLabels(
    readStoredString(LAYOUT_PREF_KEYS.conversationListItemLabels),
  ),
)

const groupByOptions: Array<{ value: ConversationListGroupBy; label: string }> =
  [
    { value: 'none', label: 'No grouping' },
    { value: 'agent', label: 'Group by agent' },
    { value: 'workspace', label: 'Group by workspace' },
    { value: 'source', label: 'Group by data source' },
  ]

const labelFieldOptions = CONVERSATION_LIST_LABEL_OPTIONS

const conversationItems = computed((): Conversation[] => {
  return Object.values(agentStore.conversationList)
    .flat()
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
})

/** Unique workspace folders from existing conversations, newest first. */
const existingWorkspaces = computed((): Array<{ path: string; label: string }> => {
  const seen = new Set<string>()
  const out: Array<{ path: string; label: string }> = []
  for (const conv of conversationItems.value) {
    const path = conv.workspacePath?.trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push({
      path,
      label: workspaceBasename(path) || path,
    })
  }
  return out
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

watch(
  itemLabels,
  (value) => {
    writeStoredString(
      LAYOUT_PREF_KEYS.conversationListItemLabels,
      serializeConversationListItemLabels(value),
    )
  },
  { deep: true },
)

function toggleItemLabel(field: ConversationListLabelField) {
  itemLabels.value = {
    ...itemLabels.value,
    [field]: !itemLabels.value[field],
  }
}

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

function positionFloatingMenu(
  trigger: HTMLElement | null,
  width: number,
): Record<string, string> {
  if (!trigger) return {}
  const rect = trigger.getBoundingClientRect()
  const gap = 4
  let left = rect.left
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8)
  }
  return {
    position: 'fixed',
    top: `${rect.bottom + gap}px`,
    left: `${left}px`,
    width: `${width}px`,
    zIndex: '10050',
  }
}

function positionGroupByMenu() {
  groupByMenuStyle.value = positionFloatingMenu(groupByTriggerRef.value, 220)
}

function positionWorkspaceMenu() {
  workspaceMenuStyle.value = positionFloatingMenu(
    workspaceTriggerRef.value,
    260,
  )
}

async function toggleGroupByMenu() {
  workspaceMenuOpen.value = false
  if (groupByMenuOpen.value) {
    groupByMenuOpen.value = false
    return
  }
  groupByMenuOpen.value = true
  await nextTick()
  positionGroupByMenu()
}

async function toggleWorkspaceMenu() {
  groupByMenuOpen.value = false
  if (workspaceMenuOpen.value) {
    workspaceMenuOpen.value = false
    return
  }
  workspaceMenuOpen.value = true
  await nextTick()
  positionWorkspaceMenu()
}

function selectGroupBy(mode: ConversationListGroupBy) {
  groupByMode.value = mode
  groupByMenuOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (groupByMenuOpen.value) {
    const inTrigger = groupByTriggerRef.value?.contains(target)
    const inMenu = groupByMenuEl.value?.contains(target)
    if (!inTrigger && !inMenu) groupByMenuOpen.value = false
  }
  if (workspaceMenuOpen.value) {
    const inTrigger = workspaceTriggerRef.value?.contains(target)
    const inMenu = workspaceMenuEl.value?.contains(target)
    if (!inTrigger && !inMenu) workspaceMenuOpen.value = false
  }
}

function onWindowReposition() {
  if (groupByMenuOpen.value) positionGroupByMenu()
  if (workspaceMenuOpen.value) positionWorkspaceMenu()
}

const deleteDialogMessage = computed(() => {
  const conv = deleteTarget.value
  if (!conv) return ''
  const name = conv.title?.trim() || 'Untitled'
  const template =
    conv.type === 'channel'
      ? t.value.chat.deleteConversationDialog.messageChannel
      : t.value.chat.deleteConversationDialog.message
  return template.replace('{name}', name)
})

function openDeleteDialog(conv: Conversation) {
  deleteTarget.value = conv
  showDeleteDialog.value = true
}

function closeDeleteDialog() {
  if (deletingConversation.value) return
  showDeleteDialog.value = false
  deleteTarget.value = null
}

async function confirmDeleteConversation() {
  const conv = deleteTarget.value
  if (!conv || deletingConversation.value) return
  deletingConversation.value = true
  try {
    clearConversationSession(conv.id)
    await agentStore.deleteConversation(conv.id)
    showDeleteDialog.value = false
    deleteTarget.value = null
  } catch (err) {
    toast.add({
      title: t.value.chat.deleteConversationDialog.failed,
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  } finally {
    deletingConversation.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', onWindowReposition)
  window.addEventListener('scroll', onWindowReposition, true)
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
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', onWindowReposition)
  window.removeEventListener('scroll', onWindowReposition, true)
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

async function startSessionWithWorkspace(workspacePath: string) {
  workspaceMenuOpen.value = false
  const path = workspacePath.trim()
  if (!path) return
  const conv = await agentStore.createNewConversation(undefined, {
    mode: 'fresh',
    workspacePath: path,
  })
  if (!conv) return
  await agentStore.selectConversation(conv.id)
  emit('navigate-chat')
}

async function browseWorkspaceAndStartSession() {
  workspaceMenuOpen.value = false
  const selectCh = window.ipcRendererChannel?.SelectWorkspaceFolder
  if (!selectCh?.invoke) return
  const { path } = await selectCh.invoke()
  if (!path?.trim()) return
  await startSessionWithWorkspace(path)
}

function agentName(agentId: string): string {
  return agentStore.agents.find((a) => a.id === agentId)?.name ?? 'Agent'
}

function agentTypeLabel(agentId: string): string {
  const agent = agentStore.agents.find((a) => a.id === agentId)
  return formatAgentTypeLabel(agent)
}

function agentColor(agentId: string) {
  return agentStore.agents.find((a) => a.id === agentId)?.color ?? 'neutral'
}

function msgCount(conversationId: string): number {
  return agentStore.conversations?.[conversationId]?.length ?? 0
}

const conversationMetaById = computed((): Record<string, string> => {
  const labels = itemLabels.value
  const mode = groupByMode.value
  const out: Record<string, string> = {}
  for (const conv of conversationItems.value) {
    out[conv.id] = buildConversationMetaLine(
      {
        type: conv.type,
        agentName: agentName(conv.agentId),
        updatedAt: conv.updatedAt,
      },
      labels,
      { groupByMode: mode },
    )
  }
  return out
})

/** Tooltip on the right of each row; left edge flush with the row’s right edge. */
const conversationTooltipContent = {
  side: 'right' as const,
  align: 'start' as const,
  sideOffset: 0,
  collisionPadding: 8,
}

const conversationTooltipModelById = computed(
  (): Record<string, ConversationDetailTooltipModel> => {
    const out: Record<string, ConversationDetailTooltipModel> = {}
    for (const conv of conversationItems.value) {
      out[conv.id] = buildConversationDetailTooltipModel({
        title: conv.title,
        type: conv.type,
        agentName: agentName(conv.agentId),
        agentType: agentTypeLabel(conv.agentId),
        updatedAt: conv.updatedAt,
        workspacePath: conv.workspacePath,
        messageCount: msgCount(conv.id),
      })
    }
    return out
  },
)
</script>

<style scoped>
.sidebar-actions {
  padding: 8px 12px 4px;
}
.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 5px 10px;
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
  width: 32px;
  height: 32px;
  margin: 6px auto 4px;
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
.sidebar-section-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.sidebar-section-label {
  padding: 8px 14px 4px;
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
  box-sizing: border-box;
  min-width: 196px;
  max-width: min(320px, calc(100vw - 16px));
  max-height: min(360px, calc(100vh - 24px));
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow:
    0 4px 6px color-mix(in srgb, var(--ui-text) 8%, transparent),
    0 12px 28px color-mix(in srgb, var(--ui-text) 14%, transparent);
}
.conversation-groupby-menu--workspaces {
  min-width: 240px;
}
.conversation-groupby-menu__section-label {
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
.conversation-groupby-menu__divider {
  height: 1px;
  margin: 4px 6px;
  background: color-mix(in srgb, var(--ui-border) 90%, var(--ui-text) 8%);
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
.conversation-groupby-menu__check--off {
  color: var(--ui-text-muted);
  opacity: 0.7;
}
.conversation-groupby-menu__option-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.conversation-groupby-menu__option-title {
  font-size: 13px;
  color: var(--ui-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-groupby-menu__option-sub {
  font-size: 10px;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-groupby-menu__empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
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
  padding: 5px 8px 2px 8px;
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
  padding: 5px 10px 5px 12px;
  margin-bottom: 1px;
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
.agent-item-host {
  list-style: none;
  margin: 0 0 1px;
}
.agent-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px 5px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;
  border: 1px solid transparent;
  width: 100%;
  box-sizing: border-box;
  outline: none;
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
  padding: 5px 0;
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
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
}

.agent-item:hover .agent-item-actions,
.agent-item:focus-within .agent-item-actions {
  opacity: 1;
  pointer-events: auto;
}

.agent-item-action-btn {
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

.agent-item-action-btn:hover {
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  color: var(--ui-text);
}

.agent-item-action-btn--danger:hover {
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 12%, transparent);
  color: var(--color-error-600, #dc2626);
}

.agent-item-action-btn__icon {
  width: 14px;
  height: 14px;
}

.empty-item {
  font-size: 12px;
  color: var(--ui-text-muted);
  padding: 10px 12px;
}

.conversation-delete-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: color-mix(in srgb, #000 45%, transparent);
}

.conversation-delete-dialog {
  width: min(420px, 100%);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  box-shadow: 0 16px 48px color-mix(in srgb, #000 28%, transparent);
  box-sizing: border-box;
}

.conversation-delete-dialog__title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
}

.conversation-delete-dialog__message {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.conversation-delete-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.conversation-delete-dialog__btn {
  margin: 0;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.conversation-delete-dialog__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.conversation-delete-dialog__btn--danger {
  border-color: color-mix(in srgb, var(--color-error-500, #ef4444) 40%, var(--ui-border));
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 12%, var(--ui-bg));
  color: var(--color-error-600, #dc2626);
}

.conversation-delete-dialog__btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 18%, var(--ui-bg));
}
</style>
