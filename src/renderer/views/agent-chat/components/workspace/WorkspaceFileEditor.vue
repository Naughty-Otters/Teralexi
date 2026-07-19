<template>
  <div ref="editorPaneRef" class="file-editor">
    <div
      v-if="!editorTabs.length"
      ref="emptyEditorRef"
      class="file-editor-empty"
      tabindex="-1"
      @mousedown="onEmptyEditorMouseDown"
    >
      <UIcon name="i-lucide-file-code-2" class="file-editor-empty-icon" />
      <p>No files open</p>
      <span class="file-editor-empty-hint">
        Pick a file from the
        <strong>File browser</strong>
        on the left, or use
        <kbd>⌘P</kbd>
        /
        <kbd>⌘O</kbd>
        to open ·
        <kbd>⌘T</kbd>
        go to symbol.
      </span>
    </div>

    <template v-else>
      <div
        class="file-editor-tabbar"
        role="tablist"
        aria-label="Open file tabs"
      >
        <div
          v-for="tab in editorTabs"
          :key="tab.path"
          role="tab"
          tabindex="0"
          class="file-editor-tab"
          :class="{ 'file-editor-tab--active': tab.path === editorPath }"
          :title="tab.path"
          :aria-selected="tab.path === editorPath"
          @click="activateTab(tab.path)"
          @keydown.enter.prevent="activateTab(tab.path)"
          @keydown.space.prevent="activateTab(tab.path)"
        >
          <AttachmentFileTypeIcon
            :path="tab.path"
            class="file-editor-tab-icon"
          />
          <span class="file-editor-tab-name">{{ tabLabel(tab.path) }}</span>
          <span class="file-editor-tab-trailing">
            <span
              v-if="gitStore.isEditorTabDirty(tab.path)"
              class="file-editor-tab-dirty"
              aria-label="Unsaved changes"
            />
            <button
              type="button"
              class="file-editor-tab-close"
              title="Close tab"
              :aria-label="`Close ${tabLabel(tab.path)}`"
              @click.stop="closeTab(tab.path)"
            >
              <UIcon name="i-lucide-x" style="width: 13px; height: 13px" />
            </button>
          </span>
        </div>
      </div>

      <div class="file-editor-toolbar">
        <span class="file-editor-path" :title="editorPath ?? undefined">
          {{ editorPath }}
        </span>
        <span
          v-if="lspStatus && !lspStatus.hint"
          class="file-editor-lsp-status"
          :class="{
            'file-editor-lsp-status--error': lspStatus.errors > 0,
            'file-editor-lsp-status--warn':
              lspStatus.errors === 0 && lspStatus.warnings > 0,
          }"
        >
          {{ lspStatus.language }}
          <template v-if="lspStatus.errors > 0">
            · {{ lspStatus.errors }} error{{
              lspStatus.errors === 1 ? '' : 's'
            }}
          </template>
          <template v-else-if="lspStatus.warnings > 0">
            · {{ lspStatus.warnings }} warning{{
              lspStatus.warnings === 1 ? '' : 's'
            }}
          </template>
        </span>
        <span v-else-if="lspStatus?.hint" class="file-editor-lsp-hint">
          {{ lspStatus.hint }}
        </span>
        <span v-if="editorDirty" class="file-editor-dirty">Unsaved</span>
        <div class="file-editor-actions">
          <button
            type="button"
            class="file-editor-btn"
            title="Format document"
            aria-label="Format document"
            :disabled="editorLoading || editorSaving || isMutationsDisabled"
            @click="formatDocument"
          >
            <UIcon name="i-lucide-wand-2" style="width: 12px; height: 12px" />
          </button>
          <button
            type="button"
            class="file-editor-btn"
            title="Reload from disk"
            aria-label="Reload from disk"
            :disabled="editorLoading || editorSaving"
            @click="reloadEditorFile"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              style="width: 12px; height: 12px"
            />
          </button>
          <button
            type="button"
            class="file-editor-btn file-editor-btn--primary"
            :title="editorSaving ? 'Saving…' : 'Save'"
            :aria-label="editorSaving ? 'Saving…' : 'Save'"
            :disabled="
              !editorDirty ||
              editorSaving ||
              editorLoading ||
              isMutationsDisabled
            "
            @click="saveEditorFile"
          >
            <UIcon name="i-lucide-save" style="width: 12px; height: 12px" />
          </button>
          <button
            type="button"
            class="file-editor-btn"
            title="Open in preview panel"
            aria-label="Open in preview panel"
            :disabled="editorLoading || !canOpenInPreview"
            @click="openInPreviewPanel"
          >
            <UIcon
              name="i-lucide-panel-right"
              style="width: 12px; height: 12px"
            />
          </button>
          <button
            type="button"
            class="file-editor-btn"
            title="Open in default app"
            aria-label="Open in default app"
            :disabled="editorLoading"
            @click="openFileExternally"
          >
            <UIcon
              name="i-lucide-external-link"
              style="width: 12px; height: 12px"
            />
          </button>
          <button
            type="button"
            class="file-editor-btn"
            title="Close tab"
            aria-label="Close tab"
            @click="closeEditorFile"
          >
            <UIcon name="i-lucide-x" style="width: 12px; height: 12px" />
          </button>
        </div>
      </div>

      <div v-if="editorLoading" class="file-editor-state">Loading…</div>
      <div
        v-else-if="editorBinary"
        ref="binaryPreviewHostEl"
        class="file-editor-binary-preview"
      >
        <p v-if="!editorFileUrl" class="file-editor-binary-fallback">
          Binary file — preview unavailable. Use the external open button in the toolbar.
        </p>
      </div>
      <div
        v-else-if="editorError"
        class="file-editor-state file-editor-state--error"
      >
        {{ editorError }}
      </div>
      <MonacoEditor
        v-else-if="editorPath"
        :key="editorPath"
        v-model="editorContent"
        class="file-editor-monaco"
        :language="editorLanguage"
        :read-only="isMutationsDisabled"
        @ready="onMonacoReady"
      />

      <WorkspaceEditorLspHost
        v-if="
          lspHostEnabled &&
          monacoEditor &&
          editorPath &&
          !editorLoading &&
          !editorError &&
          !editorBinary
        "
        :key="`${editorPath}:${monacoEditorKey}`"
        ref="lspHostRef"
        :editor="monacoEditor"
        :read-only="isMutationsDisabled"
      />
    </template>

    <WorkspaceQuickOpen
      :open="quickOpenOpen"
      :conversation-id="conversationId"
      @close="closeQuickOpen"
      @select="onQuickOpenSelect"
    />

    <WorkspaceSymbolQuickOpen
      :open="symbolOpenOpen"
      :conversation-id="conversationId"
      @close="closeSymbolOpen"
      @select="onSymbolSelect"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from 'vue'
import { storeToRefs } from 'pinia'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { useWorkspaceGitStore } from '@store/workspace-git'
import { monacoLanguageFromPath } from '@shared/file-type/monaco-language'
import MonacoEditor from '@renderer/components/code/MonacoEditor.vue'
import WorkspaceQuickOpen from './WorkspaceQuickOpen.vue'
import WorkspaceSymbolQuickOpen from './WorkspaceSymbolQuickOpen.vue'
import type { SharedWorkspaceSymbol } from '@shared/editor/workspace-symbol-types'
import type { EditorLspStatus } from '@renderer/components/code/monaco-lsp/editor-lsp-controller'
import { useSandboxOutputView } from '@renderer/composables/useSandboxOutputView'
import AttachmentFileTypeIcon from '../AttachmentFileTypeIcon.vue'
import { requestSandboxPreview } from '../../sandboxPreviewBridge'
import { buildFilePreviewUrl } from '@shared/agent/step-attachment'

const lspHostEnabled = ref(true)

const WorkspaceEditorLspHost = defineAsyncComponent({
  loader: () => import('./WorkspaceEditorLspHost.vue'),
  onError(_error, _retry, fail) {
    lspHostEnabled.value = false
    fail()
  },
})

const gitStore = useWorkspaceGitStore()
const {
  editorTabs,
  editorPath,
  editorContent,
  editorDirty,
  editorLoading,
  editorSaving,
  editorError,
  editorBinary,
  editorFileUrl,
  isMutationsDisabled,
  conversationId,
  workspacePath,
} = storeToRefs(gitStore)

const editorPaneRef = ref<HTMLElement | null>(null)
const emptyEditorRef = ref<HTMLElement | null>(null)
const binaryPreviewHostEl = ref<HTMLElement | null>(null)
const quickOpenOpen = ref(false)
const symbolOpenOpen = ref(false)
const pendingEditorFocus = ref(false)
const pendingGoTo = ref<{
  path: string
  line: number
  column: number
} | null>(null)

const monacoEditor = shallowRef<MonacoEditorNS.IStandaloneCodeEditor | null>(
  null,
)
const monacoEditorKey = ref(0)
const lspHostRef = ref<{
  formatActiveFile: () => Promise<string | null>
  lspStatus: { value: EditorLspStatus | null }
} | null>(null)
const lspStatus = ref<EditorLspStatus | null>(null)

const editorLanguage = computed(() =>
  editorPath.value ? monacoLanguageFromPath(editorPath.value) : 'plaintext',
)

const binaryPreviewUrl = computed(() =>
  editorBinary.value ? editorFileUrl.value : null,
)

const previewPanelUrl = computed(() => {
  const fromTab = editorFileUrl.value?.trim()
  if (fromTab) return fromTab
  const rel = editorPath.value?.trim()
  const root = workspacePath.value?.trim()
  if (!rel || !root) return null
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const part = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  return buildFilePreviewUrl(`${base}/${part}`) ?? null
})

const canOpenInPreview = computed(() => Boolean(previewPanelUrl.value))

useSandboxOutputView(binaryPreviewHostEl, binaryPreviewUrl)

function tabLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(slash + 1) : normalized
}

function activateTab(path: string) {
  gitStore.activateEditorTab(path)
}

function closeTab(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const wasActive = editorPath.value === normalized
  gitStore.closeEditorTab(path)
  if (wasActive) {
    requestEditorFocusAfterTabChange()
  }
}

async function formatDocument() {
  const formatted = await lspHostRef.value?.formatActiveFile?.()
  if (formatted != null) {
    editorContent.value = formatted
  }
}

async function saveEditorFile() {
  await gitStore.saveEditorFile()
}

function reloadEditorFile() {
  void gitStore.reloadEditorFile()
}

function closeEditorFile() {
  if (!editorPath.value) return
  closeTab(editorPath.value)
}

function requestEditorFocusAfterTabChange() {
  pendingEditorFocus.value = true
  void nextTick(() => restoreEditorFocus())
}

function openFileExternally() {
  if (!editorPath.value) return
  void gitStore.openFile(editorPath.value)
}

function openInPreviewPanel() {
  const url = previewPanelUrl.value
  if (!url) return
  requestSandboxPreview(url)
}

function onEmptyEditorMouseDown() {
  emptyEditorRef.value?.focus({ preventScroll: true })
}

function openQuickOpen() {
  if (!conversationId.value?.trim()) return
  symbolOpenOpen.value = false
  quickOpenOpen.value = true
}

function closeQuickOpen() {
  quickOpenOpen.value = false
  pendingEditorFocus.value = true
  void nextTick(() => restoreEditorFocus())
}

function openSymbolOpen() {
  if (!conversationId.value?.trim()) return
  quickOpenOpen.value = false
  symbolOpenOpen.value = true
}

function closeSymbolOpen() {
  symbolOpenOpen.value = false
  pendingEditorFocus.value = true
  void nextTick(() => restoreEditorFocus())
}

async function pickWorkspaceFile() {
  const cid = conversationId.value?.trim()
  if (!cid) return

  const ch = window.ipcRendererChannel?.PickWorkspaceEditorFile
  if (!ch?.invoke) return

  const result = await ch.invoke({ conversationId: cid })
  if (!result.ok || !result.relativePath) return

  pendingEditorFocus.value = true
  await gitStore.openFileInEditor(result.relativePath)
  void nextTick(() => restoreEditorFocus())
}

function restoreEditorFocus(): void {
  if (applyPendingGoTo()) return

  const editor = monacoEditor.value
  if (editor) {
    editor.focus()
    pendingEditorFocus.value = false
    return
  }

  if (!editorTabs.value.length) {
    emptyEditorRef.value?.focus({ preventScroll: true })
    pendingEditorFocus.value = false
    return
  }

  // Active tab switched but Monaco is still remounting — onMonacoReady will focus.
}

function applyPendingGoTo(): boolean {
  const target = pendingGoTo.value
  const editor = monacoEditor.value
  const path = editorPath.value?.replace(/\\/g, '/')
  if (!target || !editor || path !== target.path.replace(/\\/g, '/')) {
    return false
  }

  pendingGoTo.value = null
  editor.setPosition({
    lineNumber: target.line,
    column: target.column,
  })
  editor.revealLineInCenter(target.line)
  editor.focus()
  pendingEditorFocus.value = false
  return true
}

function onQuickOpenSelect(relativePath: string) {
  pendingEditorFocus.value = true
  void gitStore.openFileInEditor(relativePath).then(() => {
    void nextTick(() => restoreEditorFocus())
  })
}

function onSymbolSelect(symbol: SharedWorkspaceSymbol) {
  pendingGoTo.value = {
    path: symbol.path.replace(/\\/g, '/'),
    line: symbol.line,
    column: symbol.character,
  }
  pendingEditorFocus.value = true
  void gitStore.openFileInEditor(symbol.path).then(() => {
    void nextTick(() => restoreEditorFocus())
  })
}

function isEditorPaneFocused(): boolean {
  if (quickOpenOpen.value || symbolOpenOpen.value) return true
  if (monacoEditor.value?.hasTextFocus()) return true
  const pane = editorPaneRef.value
  if (pane?.contains(document.activeElement)) {
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active.classList.contains('file-editor-empty')
    ) {
      return true
    }
    if (active instanceof HTMLElement && active.closest('.monaco-editor')) {
      return true
    }
  }
  return false
}

function onMonacoReady(editor: MonacoEditorNS.IStandaloneCodeEditor) {
  monacoEditor.value = editor
  monacoEditorKey.value += 1
  if (pendingEditorFocus.value || pendingGoTo.value) {
    void nextTick(() => {
      if (!applyPendingGoTo()) {
        editor.focus()
        pendingEditorFocus.value = false
      }
    })
  }
}

watch(editorLoading, (loading, wasLoading) => {
  if (
    wasLoading &&
    !loading &&
    (pendingEditorFocus.value || pendingGoTo.value)
  ) {
    void nextTick(() => restoreEditorFocus())
  }
})

watch(editorPath, () => {
  monacoEditor.value = null
})

watchEffect(() => {
  const host = lspHostRef.value
  if (!host?.lspStatus) {
    lspStatus.value = null
    return
  }
  const exposed = host.lspStatus as
    | EditorLspStatus
    | { value: EditorLspStatus | null }
  lspStatus.value =
    exposed && typeof exposed === 'object' && 'value' in exposed
      ? exposed.value
      : (exposed as EditorLspStatus | null)
})

function onKeyDown(event: KeyboardEvent) {
  if (!isEditorPaneFocused()) return

  const mod = event.metaKey || event.ctrlKey
  if (mod) {
    const key = event.key.toLowerCase()
    if (key === 'p') {
      event.preventDefault()
      openQuickOpen()
      return
    }
    if (key === 'o') {
      event.preventDefault()
      void pickWorkspaceFile()
      return
    }
    if (key === 't') {
      event.preventDefault()
      openSymbolOpen()
      return
    }
    if (key === 'w' && editorPath.value) {
      event.preventDefault()
      closeEditorFile()
      return
    }
    if (key === 'g' && monacoEditor.value) {
      event.preventDefault()
      void monacoEditor.value.getAction('editor.action.gotoLine')?.run()
      return
    }
    if (key === 's') {
      if (!editorPath.value || !editorDirty.value) return
      event.preventDefault()
      void saveEditorFile()
      return
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.file-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--ui-bg);
  font-family: var(--app-font-family);
  font-size: var(--app-font-size);
}

.file-editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  padding: 20px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: var(--app-font-size-secondary);
  outline: none;
}

.file-editor-empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.35;
}

.file-editor-empty-hint {
  font-size: var(--app-font-size-sm);
  opacity: 0.85;
  max-width: 280px;
  line-height: 1.5;
}

.file-editor-empty-hint strong {
  color: var(--ui-text);
  font-weight: 600;
}

.file-editor-empty-hint kbd {
  font-family: var(--app-font-family);
  font-size: var(--app-font-size-xs);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
}

.file-editor-tabbar {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  height: var(--wp-tab-strip-height, 38px);
  padding: 0;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  flex-shrink: 0;
  scrollbar-width: none;
}

.file-editor-tabbar::-webkit-scrollbar {
  display: none;
}

.file-editor-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  min-width: 0;
  height: 100%;
  padding: 0 12px;
  border: none;
  border-right: 1px solid var(--ui-border);
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: var(--app-font-size);
  font-family: var(--app-font-family);
  line-height: 1.2;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    color 0.14s ease,
    background 0.14s ease,
    box-shadow 0.14s ease;
}

.file-editor-tab:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 5%, transparent);
}

.file-editor-tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px
    color-mix(in srgb, var(--color-primary-500) 30%, transparent);
}

.file-editor-tab--active,
.file-editor-tab--active:hover {
  color: var(--ui-text);
  background: var(--ui-bg);
  box-shadow: inset 0 2px 0 var(--color-primary-500, #6366f1);
}

.file-editor-tab-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.file-editor-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-weight: 500;
}

.file-editor-tab-trailing {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.file-editor-tab-dirty {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--color-warning-500, #f59e0b);
  transition: opacity 0.12s ease;
}

.file-editor-tab-close {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.12s ease,
    color 0.12s ease,
    background 0.12s ease;
}

.file-editor-tab:hover .file-editor-tab-close,
.file-editor-tab--active .file-editor-tab-close {
  opacity: 1;
  pointer-events: auto;
}

.file-editor-tab:hover .file-editor-tab-dirty,
.file-editor-tab--active .file-editor-tab-dirty {
  opacity: 0;
}

.file-editor-tab-close:hover {
  color: var(--color-error-500, #ef4444);
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 14%, transparent);
}

.file-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  flex-shrink: 0;
  min-width: 0;
}

.file-editor-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--app-font-size-sm);
  font-family: var(--app-font-family);
  color: var(--ui-text);
}

.file-editor-lsp-status {
  flex-shrink: 0;
  font-size: var(--app-font-size-xs);
  color: var(--ui-text-muted);
  text-transform: lowercase;
}

.file-editor-lsp-status--warn {
  color: var(--color-warning-600, #d97706);
}

.file-editor-lsp-status--error {
  color: var(--color-error-600, #dc2626);
}

.file-editor-lsp-hint {
  flex-shrink: 0;
  font-size: var(--app-font-size-xs);
  color: var(--ui-text-muted);
  opacity: 0.85;
}

.file-editor-dirty {
  flex-shrink: 0;
  font-size: var(--app-font-size-xs);
  font-weight: 600;
  color: var(--color-warning-600, #d97706);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.file-editor-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.file-editor-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: var(--app-font-size-sm);
  font-weight: 500;
  cursor: pointer;
}

.file-editor-btn:hover:not(:disabled) {
  color: var(--ui-text);
  background: var(--ui-bg-elevated);
}

.file-editor-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.file-editor-btn--primary {
  color: var(--color-primary-600, #4f46e5);
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 35%,
    var(--ui-border)
  );
}

.file-editor-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-size: var(--app-font-size-secondary);
  color: var(--ui-text-muted);
}

.file-editor-state--error {
  color: var(--color-error-600, #dc2626);
}

.file-editor-binary-preview {
  flex: 1;
  min-height: 0;
  position: relative;
  background: var(--ui-bg);
}

.file-editor-binary-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 16px;
  font-size: var(--app-font-size-secondary);
  color: var(--ui-text-muted);
  text-align: center;
}

.file-editor-monaco {
  flex: 1;
  min-height: 0;
}

:global(html.dark .file-editor) {
  background: var(--ui-bg-elevated);
}

:global(html.dark .file-editor .file-editor-monaco),
:global(html.dark .file-editor .file-editor-monaco .code-editor),
:global(html.dark .file-editor .file-editor-monaco .code-editor-root) {
  background: var(--ui-bg-elevated);
}
</style>
