<template>
  <div
    class="rich-composer"
    :class="{
      'rich-composer--picker-open':
        mentionOpen || subAgentMentionOpen || slashOpen || agentPickerOpen,
      'rich-composer--agent-picker-open': agentPickerOpen,
      'rich-composer--editor-menu-open':
        mentionOpen || subAgentMentionOpen || slashOpen,
    }"
  >
    <div class="rich-composer-toolbar" role="toolbar" aria-label="Message composer">
      <template v-if="!hideContextSelectors">
        <AgentPickerButton
          ref="agentPickerRef"
          v-model:highlight-index="agentPickerHighlightIndex"
          :selected-agent-id="selectedAgentId"
          :agent-options="agentOptions"
          @select-agent="emit('select-agent', $event)"
          @menu-open-change="agentPickerOpen = $event"
        />
        <WorkspaceSelector variant="toolbar" :disabled="workspaceDisabled" />
        <span class="rich-composer-toolbar-divider" aria-hidden="true" />
      </template>
      <template v-if="editor">
      <button
        type="button"
        class="rich-composer-tool"
        :class="{ 'rich-composer-tool--active': editor.isActive('bold') }"
        title="Bold"
        @mousedown.prevent
        @click="editor.chain().focus().toggleBold().run()"
      >
        <UIcon name="i-lucide-bold" />
      </button>
      <button
        type="button"
        class="rich-composer-tool"
        :class="{ 'rich-composer-tool--active': editor.isActive('italic') }"
        title="Italic"
        @mousedown.prevent
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <UIcon name="i-lucide-italic" />
      </button>
      <button
        type="button"
        class="rich-composer-tool"
        :class="{ 'rich-composer-tool--active': editor.isActive('code') }"
        title="Inline code"
        @mousedown.prevent
        @click="editor.chain().focus().toggleCode().run()"
      >
        <UIcon name="i-lucide-code" />
      </button>
      <button
        type="button"
        class="rich-composer-tool"
        :class="{ 'rich-composer-tool--active': editor.isActive('bulletList') }"
        title="Bullet list"
        @mousedown.prevent
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        <UIcon name="i-lucide-list" />
      </button>
      <button
        type="button"
        class="rich-composer-tool"
        :class="{ 'rich-composer-tool--active': editor.isActive('orderedList') }"
        title="Numbered list"
        @mousedown.prevent
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        <UIcon name="i-lucide-list-ordered" />
      </button>
      <button
        type="button"
        class="rich-composer-tool"
        :class="{ 'rich-composer-tool--active': editor.isActive('link') }"
        title="Link"
        @mousedown.prevent
        @click="onLinkClick"
      >
        <UIcon name="i-lucide-link" />
      </button>
      <button
        type="button"
        class="rich-composer-tool"
        title="Attach files"
        :disabled="disabled || !canAddAttachments"
        @mousedown.prevent
        @click="emit('pick-attachments')"
      >
        <UIcon name="i-lucide-paperclip" />
      </button>
      </template>
    </div>
    <div
      v-if="stagedAttachments.length > 0"
      class="rich-composer-attachments"
      aria-label="Pending attachments"
    >
      <div
        v-for="item in stagedAttachments"
        :key="item.id"
        class="rich-composer-attachment-chip"
      >
        <UIcon name="i-lucide-file" class="rich-composer-attachment-icon" />
        <span class="rich-composer-attachment-name">{{ item.name }}</span>
        <button
          type="button"
          class="rich-composer-attachment-remove"
          aria-label="Remove attachment"
          @click="emit('remove-attachment', item.id)"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </div>
    </div>
    <div
      class="rich-composer-editor-wrap"
      @dragover.prevent="onDragOver"
      @drop.prevent="onDrop"
    >
      <ComposerSlashCommandMenu
        ref="slashMenuRef"
        :open="slashOpen"
        :query="slashQuery"
        :items="slashItems"
        :active-index="slashHighlightIndex"
        @select="onSlashSelect"
        @highlight="slashHighlightIndex = $event"
        @close="onSlashMenuClose"
      />
      <ComposerSubAgentMentionMenu
        ref="subAgentMentionMenuRef"
        :open="subAgentMentionOpen"
        :query="subAgentMentionQuery"
        :items="subAgentMentionItems"
        :active-index="subAgentMentionHighlightIndex"
        :enabled="subAgentMentionEnabled"
        @select="onSubAgentMentionSelect"
        @highlight="subAgentMentionHighlightIndex = $event"
        @close="onSubAgentMentionMenuClose"
      />
      <ComposerFileMentionMenu
        :open="mentionOpen"
        :query="mentionQuery"
        :items="mentionItems"
        :loading="mentionLoading"
        @select="onMentionSelect"
      />
      <EditorContent :editor="editor" class="rich-composer-editor" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Extension } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3'
import { ref, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import AgentPickerButton from './AgentPickerButton.vue'
import {
  registerComposerAgentPicker,
  unregisterComposerAgentPicker,
} from '@renderer/composables/useComposerAgentPicker'
import ComposerFileMentionMenu from './ComposerFileMentionMenu.vue'
import ComposerSubAgentMentionMenu from './ComposerSubAgentMentionMenu.vue'
import {
  filterSubAgentMentionMenuItems,
  shouldPreferSubAgentMentionMenu,
} from './composer-sub-agent-mentions'
import type { SubAgentTarget } from '@shared/agent/sub-agent-targets'
import ComposerSlashCommandMenu from './ComposerSlashCommandMenu.vue'
import WorkspaceSelector from './WorkspaceSelector.vue'
import { useWorkspaceStore } from '@store/workspace'
import {
  filterSlashCommands,
  type ComposerSlashCommand,
} from './composer-slash-commands'
import type { QueueDeliveryMode } from '../conversation-chat-session'
import type { StagedChatAttachment } from '@renderer/composables/useChatAttachments'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    selectedAgentId: string | null
    agentOptions: Array<{ id: string; name: string }>
    conversationId?: string | null
    workspaceDisabled?: boolean
    /** When false, only universal slash commands (/compact, /help) are offered. */
    codingAgent?: boolean
    subAgentTargets?: SubAgentTarget[]
    subAgentMentionEnabled?: boolean
    /** When true, hides agent picker and workspace selector in the toolbar. */
    hideContextSelectors?: boolean
    disabled?: boolean
    stagedAttachments?: StagedChatAttachment[]
    canAddAttachments?: boolean
  }>(),
  {
    placeholder: 'Message…',
    selectedAgentId: null,
    agentOptions: () => [],
    conversationId: null,
    workspaceDisabled: false,
    subAgentTargets: () => [],
    subAgentMentionEnabled: false,
    hideContextSelectors: false,
    disabled: false,
    stagedAttachments: () => [],
    canAddAttachments: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select-agent': [agentId: string]
  submit: []
  'pick-attachments': []
  'remove-attachment': [id: string]
  'add-attachment-paths': [paths: string[]]
}>()

let syncingFromParent = false

const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionItems = ref<string[]>([])
const mentionLoading = ref(false)
const mentionRange = ref<{ from: number; to: number } | null>(null)
let mentionSearchToken = 0

const subAgentMentionOpen = ref(false)
const subAgentMentionQuery = ref('')
const subAgentMentionItems = ref<SubAgentTarget[]>([])
const subAgentMentionRange = ref<{ from: number; to: number } | null>(null)
const subAgentMentionHighlightIndex = ref(0)

const slashOpen = ref(false)
const slashQuery = ref('')
const slashItems = ref<ComposerSlashCommand[]>([])
const slashRange = ref<{ from: number; to: number } | null>(null)
const slashHighlightIndex = ref(0)
const slashMenuRef = ref<InstanceType<typeof ComposerSlashCommandMenu> | null>(null)
const subAgentMentionMenuRef = ref<InstanceType<typeof ComposerSubAgentMentionMenu> | null>(
  null,
)
const agentPickerRef = ref<InstanceType<typeof AgentPickerButton> | null>(null)
const agentPickerOpen = ref(false)
const agentPickerHighlightIndex = ref(0)

const workspaceStore = useWorkspaceStore()

function resetAgentPickerHighlight() {
  const idx = props.agentOptions.findIndex(
    (agent) => agent.id === props.selectedAgentId,
  )
  agentPickerHighlightIndex.value = idx >= 0 ? idx : 0
}

function openAgentPickerFromCommand() {
  closeSlashMenu()
  resetAgentPickerHighlight()
  void nextTick(() => {
    agentPickerRef.value?.openMenu()
  })
}

onMounted(() => {
  registerComposerAgentPicker(openAgentPickerFromCommand)
})

onBeforeUnmount(() => {
  unregisterComposerAgentPicker(openAgentPickerFromCommand)
})

function closeSlashMenu() {
  slashOpen.value = false
  slashQuery.value = ''
  slashItems.value = []
  slashRange.value = null
  slashHighlightIndex.value = 0
}

function onSlashMenuClose() {
  closeSlashMenu()
  editor.value?.chain().focus().run()
}

function closeMentionMenu() {
  mentionOpen.value = false
  mentionQuery.value = ''
  mentionItems.value = []
  mentionRange.value = null
  mentionLoading.value = false
}

function closeSubAgentMentionMenu() {
  subAgentMentionOpen.value = false
  subAgentMentionQuery.value = ''
  subAgentMentionItems.value = []
  subAgentMentionRange.value = null
  subAgentMentionHighlightIndex.value = 0
}

function onSubAgentMentionMenuClose() {
  closeSubAgentMentionMenu()
  editor.value?.chain().focus().run()
}

function refreshSubAgentMentionMenu(ed: Editor): boolean {
  const hit = getMentionAtCursor(ed)
  if (
    !hit ||
    !shouldPreferSubAgentMentionMenu(
      hit.query,
      props.subAgentMentionEnabled,
      props.subAgentTargets,
    )
  ) {
    closeSubAgentMentionMenu()
    return false
  }

  closeMentionMenu()
  const wasOpen = subAgentMentionOpen.value
  const queryChanged = subAgentMentionQuery.value !== hit.query
  subAgentMentionOpen.value = true
  subAgentMentionQuery.value = hit.query
  subAgentMentionRange.value = { from: hit.from, to: hit.to }
  subAgentMentionItems.value = filterSubAgentMentionMenuItems(
    props.subAgentTargets,
    hit.query,
  )
  if (!wasOpen || queryChanged) {
    subAgentMentionHighlightIndex.value = 0
  } else if (subAgentMentionHighlightIndex.value >= subAgentMentionItems.value.length) {
    subAgentMentionHighlightIndex.value = Math.max(
      0,
      subAgentMentionItems.value.length - 1,
    )
  }
  return true
}

function onSubAgentMentionSelect(item: SubAgentTarget) {
  const ed = editor.value
  const range = subAgentMentionRange.value
  if (!ed || !range) return
  const insert = `@${item.mentionSlug} `
  ed.chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, insert)
    .run()
  closeSubAgentMentionMenu()
}

function getSlashCommandAtCursor(ed: Editor): {
  query: string
  from: number
  to: number
} | null {
  const { from } = ed.state.selection
  const lineStart = ed.state.selection.$from.start()
  const textInLine = ed.state.doc.textBetween(lineStart, from, '\n', '\ufffc')
  const match = textInLine.match(/^\/([\w-]*)$/)
  if (!match) return null
  const query = match[1] ?? ''
  const slashPos = lineStart
  return { query, from: slashPos, to: from }
}

function refreshSlashMenu(ed: Editor) {
  const hit = getSlashCommandAtCursor(ed)
  if (!hit) {
    closeSlashMenu()
    return
  }
  const items = filterSlashCommands(
    hit.query,
    props.codingAgent ?? false,
    props.subAgentMentionEnabled,
  )
  if (items.length === 0) {
    closeSlashMenu()
    return
  }
  const wasOpen = slashOpen.value
  const queryChanged = slashQuery.value !== hit.query
  slashOpen.value = true
  slashQuery.value = hit.query
  slashRange.value = { from: hit.from, to: hit.to }
  slashItems.value = items
  if (!wasOpen || queryChanged) {
    slashHighlightIndex.value = 0
  } else if (slashHighlightIndex.value >= items.length) {
    slashHighlightIndex.value = Math.max(0, items.length - 1)
  }
}

function onSlashSelect(command: ComposerSlashCommand) {
  const ed = editor.value
  const range = slashRange.value
  if (!ed || !range) return
  const insert = `${command.label} `
  ed.chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, insert)
    .run()
  closeSlashMenu()
}

function getMentionAtCursor(ed: Editor): {
  query: string
  from: number
  to: number
} | null {
  const { from } = ed.state.selection
  const textBefore = ed.state.doc.textBetween(Math.max(0, from - 200), from, '\n', '\ufffc')
  const match = textBefore.match(/(?:^|\s)@([\w./\-]*)$/)
  if (!match) return null
  const query = match[1] ?? ''
  const atPos = from - query.length - 1
  return { query, from: atPos, to: from }
}

async function refreshComposerMenus(ed: Editor) {
  const slashHit = getSlashCommandAtCursor(ed)
  if (slashHit) {
    closeMentionMenu()
    closeSubAgentMentionMenu()
    refreshSlashMenu(ed)
    return
  }
  closeSlashMenu()

  const mentionHit = getMentionAtCursor(ed)
  if (mentionHit && refreshSubAgentMentionMenu(ed)) {
    return
  }
  closeSubAgentMentionMenu()
  await refreshMentionMenu(ed)
}

async function refreshMentionMenu(ed: Editor) {
  const hit = getMentionAtCursor(ed)
  if (!hit || !props.conversationId?.trim()) {
    closeMentionMenu()
    return
  }
  if (
    shouldPreferSubAgentMentionMenu(
      hit.query,
      props.subAgentMentionEnabled,
      props.subAgentTargets,
    )
  ) {
    closeMentionMenu()
    return
  }

  mentionOpen.value = true
  mentionQuery.value = hit.query
  mentionRange.value = { from: hit.from, to: hit.to }

  const token = ++mentionSearchToken
  mentionLoading.value = true
  try {
    const ch = window.ipcRendererChannel?.SearchWorkspaceFiles
    const uploadCh = window.ipcRendererChannel?.SearchChatAttachments
    const uploadsPromise = uploadCh
      ? uploadCh.invoke({
          conversationId: props.conversationId,
          query: hit.query,
          limit: 10,
        })
      : Promise.resolve({ ok: true, paths: [] as string[] })
    const workspacePromise = ch
      ? ch.invoke({
          conversationId: props.conversationId,
          query: hit.query,
          limit: 20,
        })
      : Promise.resolve({ ok: true, paths: [] as string[] })

    const [uploadResult, workspaceResult] = await Promise.all([
      uploadsPromise,
      workspacePromise,
    ])
    if (token !== mentionSearchToken) return
    const uploadPaths = uploadResult.ok ? uploadResult.paths : []
    const workspacePaths = workspaceResult.ok ? workspaceResult.paths : []
    const seen = new Set<string>()
    mentionItems.value = [...uploadPaths, ...workspacePaths].filter((path) => {
      if (seen.has(path)) return false
      seen.add(path)
      return true
    })
  } finally {
    if (token === mentionSearchToken) mentionLoading.value = false
  }
}

function onMentionSelect(path: string) {
  const ed = editor.value
  const range = mentionRange.value
  if (!ed || !range) return
  const insert = `@${path} `
  ed.chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, insert)
    .run()
  closeMentionMenu()
}

function onDragOver(event: DragEvent) {
  if (props.disabled || !props.canAddAttachments) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDrop(event: DragEvent) {
  if (props.disabled || !props.canAddAttachments) return
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  const paths: string[] = []
  for (const file of files) {
    const withPath = file as File & { path?: string }
    if (typeof withPath.path === 'string' && withPath.path.trim()) {
      paths.push(withPath.path.trim())
    }
  }
  if (paths.length > 0) emit('add-attachment-paths', paths)
}

watch(
  () => slashItems.value.length,
  (len) => {
    if (slashHighlightIndex.value >= len) {
      slashHighlightIndex.value = Math.max(0, len - 1)
    }
  },
)

watch(
  () => subAgentMentionItems.value.length,
  (len) => {
    if (subAgentMentionHighlightIndex.value >= len) {
      subAgentMentionHighlightIndex.value = Math.max(0, len - 1)
    }
  },
)

const SubmitOnEnter = Extension.create({
  name: 'submitOnEnter',
  addKeyboardShortcuts() {
    return {
      ArrowDown: () => {
        if (agentPickerOpen.value) {
          const len = props.agentOptions.length
          if (len > 0) {
            agentPickerHighlightIndex.value =
              (agentPickerHighlightIndex.value + 1) % len
            agentPickerRef.value?.scrollToHighlight()
          }
          return true
        }
        if (subAgentMentionOpen.value && subAgentMentionItems.value.length > 0) {
          subAgentMentionMenuRef.value?.moveHighlight(
            subAgentMentionHighlightIndex.value,
            1,
          )
          return true
        }
        if (!slashOpen.value || slashItems.value.length === 0) return false
        slashHighlightIndex.value =
          (slashHighlightIndex.value + 1) % slashItems.value.length
        slashMenuRef.value?.focusActiveItem()
        return true
      },
      ArrowUp: () => {
        if (agentPickerOpen.value) {
          const len = props.agentOptions.length
          if (len > 0) {
            agentPickerHighlightIndex.value =
              (agentPickerHighlightIndex.value - 1 + len) % len
            agentPickerRef.value?.scrollToHighlight()
          }
          return true
        }
        if (subAgentMentionOpen.value && subAgentMentionItems.value.length > 0) {
          subAgentMentionMenuRef.value?.moveHighlight(
            subAgentMentionHighlightIndex.value,
            -1,
          )
          return true
        }
        if (!slashOpen.value || slashItems.value.length === 0) return false
        slashHighlightIndex.value =
          (slashHighlightIndex.value - 1 + slashItems.value.length) %
          slashItems.value.length
        slashMenuRef.value?.focusActiveItem()
        return true
      },
      Tab: () => {
        if (agentPickerOpen.value) {
          const len = props.agentOptions.length
          if (len > 0) {
            agentPickerHighlightIndex.value =
              (agentPickerHighlightIndex.value + 1) % len
            agentPickerRef.value?.scrollToHighlight()
          }
          return true
        }
        if (subAgentMentionOpen.value && subAgentMentionItems.value.length > 0) {
          subAgentMentionMenuRef.value?.focusActiveItem()
          return true
        }
        if (!slashOpen.value || slashItems.value.length === 0) return false
        slashMenuRef.value?.focusActiveItem()
        return true
      },
      Escape: () => {
        if (agentPickerOpen.value) {
          agentPickerRef.value?.closeMenu()
          return true
        }
        if (subAgentMentionOpen.value) {
          onSubAgentMentionMenuClose()
          return true
        }
        if (slashOpen.value) {
          onSlashMenuClose()
          return true
        }
        if (!props.workspaceDisabled && workspaceStore.isWorkspaceActive) {
          void workspaceStore.clearWorkspace()
          return true
        }
        return false
      },
      Enter: () => {
        if (this.editor.view.composing) return false
        if (agentPickerOpen.value) {
          const agent = props.agentOptions[agentPickerHighlightIndex.value]
          if (agent) {
            emit('select-agent', agent.id)
            agentPickerRef.value?.closeMenu()
          }
          return true
        }
        if (subAgentMentionOpen.value && subAgentMentionItems.value.length > 0) {
          const item = subAgentMentionItems.value[subAgentMentionHighlightIndex.value]
          if (item) onSubAgentMentionSelect(item)
          return true
        }
        if (slashOpen.value && slashItems.value.length > 0) {
          const cmd = slashItems.value[slashHighlightIndex.value]
          if (cmd) onSlashSelect(cmd)
          return true
        }
        emit('submit')
        return true
      },
      'Shift-Enter': () =>
        this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.createParagraphNear(),
          () => commands.splitBlock(),
        ]),
    }
  },
})

const editor = useEditor({
  content: props.modelValue || '',
  contentType: 'markdown',
  editable: !props.disabled,
  autofocus: false,
  extensions: [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      },
    }),
    Markdown,
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    SubmitOnEnter,
  ],
  onUpdate: ({ editor: ed }) => {
    if (syncingFromParent) return
    emit('update:modelValue', ed.getMarkdown())
    void refreshComposerMenus(ed)
  },
  onSelectionUpdate: ({ editor: ed }) => {
    void refreshComposerMenus(ed)
  },
})

/**
 * Sync parent → editor only when clearing after send or when the field is not focused.
 * Applying setContent on every v-model echo while typing resets ProseMirror and blocks input.
 */
watch(
  () => props.modelValue,
  (next) => {
    const ed = editor.value
    if (!ed) return

    const current = ed.getMarkdown()
    if (next === current) return

    const clearing = next.trim() === ''
    if (!clearing && ed.isFocused) return

    syncingFromParent = true
    ed.commands.setContent(next || '', { contentType: 'markdown', emitUpdate: false })
    syncingFromParent = false
  },
)

watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled)
  },
)

function onLinkClick() {
  const ed = editor.value
  if (!ed) return
  const previous = ed.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL', previous ?? 'https://')
  if (url === null) return
  if (url === '') {
    ed.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}
</script>

<style scoped>
.rich-composer {
  display: flex;
  flex-direction: column;
  min-height: 88px;
}

.rich-composer-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 6px 8px 0;
  position: relative;
  z-index: 3;
}

.rich-composer-toolbar-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: color-mix(in srgb, var(--ui-border) 90%, var(--ui-text) 8%);
  flex-shrink: 0;
}

.rich-composer-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.rich-composer-tool:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
  color: var(--ui-text);
}

.rich-composer-tool--active {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-500, var(--ui-text));
}

.rich-composer--agent-picker-open .rich-composer-toolbar {
  z-index: 25;
}

.rich-composer--editor-menu-open .rich-composer-editor-wrap {
  z-index: 15;
}

.rich-composer-editor-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 2;
}

.rich-composer-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 10px 8px;
}

.rich-composer-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 4%, var(--ui-bg-elevated));
  font-size: 12px;
  color: var(--ui-text);
}

.rich-composer-attachment-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.rich-composer-attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.rich-composer-attachment-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.rich-composer-attachment-remove:hover {
  background: color-mix(in srgb, var(--ui-text) 10%, transparent);
  color: var(--ui-text);
}

.rich-composer-editor {
  min-height: 0;
}

.rich-composer-editor :deep(.tiptap) {
  min-height: 56px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 48px 12px 14px;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text);
  cursor: text;
}

.rich-composer-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 40px;
}

.rich-composer-editor :deep(.tiptap p) {
  margin: 0;
}

.rich-composer-editor :deep(.tiptap p + p) {
  margin-top: 0.5em;
}

.rich-composer-editor :deep(.tiptap ul),
.rich-composer-editor :deep(.tiptap ol) {
  margin: 0.35em 0 0;
  padding-left: 1.25em;
}

.rich-composer-editor :deep(.tiptap code) {
  font-family: var(--app-font-family);
  font-size: 0.9em;
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.rich-composer-editor :deep(.tiptap a) {
  color: var(--color-primary-500, #3b82f6);
  text-decoration: underline;
  cursor: pointer;
}

.rich-composer-editor :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--ui-text-muted);
  pointer-events: none;
  height: 0;
}
</style>
