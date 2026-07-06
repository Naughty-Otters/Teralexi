<template>
  <div class="wf-studio">
    <div class="wf-studio-top">
      <div v-if="validationMessages.length" class="wf-alerts">
        <p
          v-for="(msg, i) in validationMessages"
          :key="`${msg}-${i}`"
          :class="msg.kind === 'error' ? 'wf-error' : 'wf-warn'"
        >
          {{ msg.text }}
        </p>
      </div>
      <button
        type="button"
        class="wf-btn wf-btn--primary wf-confirm-btn"
        :disabled="!latestVersionId || confirming"
        @click="confirm"
      >
        {{ t.workflows.studio.confirm }}
      </button>
    </div>

    <div class="wf-studio-body">
      <section class="wf-chat-pane">
        <div class="wf-chat-header">
          <p class="wf-chat-header-meta">
            <span class="status-dot" :class="{ 'status-dot--streaming': isBusy }" />
            <span v-if="isBusy">{{ t.workflows.studio.compiling }}</span>
            <span v-else>{{ t.workflows.studio.chatReady }}</span>
          </p>
        </div>

        <div ref="messagesEl" class="wf-chat-messages">
          <div
            v-for="msg in visibleMessages"
            :key="msg.id"
            :class="[
              'wf-chat-row',
              msg.role === 'user' ? 'wf-chat-row--user' : 'wf-chat-row--assistant',
            ]"
          >
            <ChatUserMessage v-if="msg.role === 'user'" :message="msg" />
            <ChatAssistantMessageParts
              v-else
              :message="msg"
              :render-text-part-html="assistantTextPartHtml"
              :chat-ready="!!chatInst"
              :show-thinking-indicator="
                thinkingAssistantMessageId != null &&
                msg.id === thinkingAssistantMessageId
              "
            />
          </div>
        </div>

        <form class="wf-chat-composer" @submit.prevent="onSubmit">
          <div class="composer-shell">
            <RichMessageComposer
              v-model="draft"
              hide-context-selectors
              :disabled="isBusy"
              :selected-agent-id="null"
              :agent-options="[]"
              :placeholder="t.workflows.studio.promptPlaceholder"
              @submit="onSubmit"
            />
            <button
              v-if="isBusy"
              type="button"
              class="composer-send cp-icon-btn cp-icon-btn--compact"
              :aria-label="t.workflows.studio.stop"
              :title="t.workflows.studio.stop"
              @click="onStop"
            >
              <UIcon class="cp-icon-btn__glyph" name="i-lucide-square" />
            </button>
            <button
              v-else
              type="submit"
              class="composer-send cp-icon-btn cp-icon-btn--compact"
              :disabled="!draft.trim()"
              :aria-label="t.workflows.studio.send"
              :title="t.workflows.studio.send"
            >
              <UIcon class="cp-icon-btn__glyph" name="i-lucide-arrow-up" />
            </button>
          </div>
        </form>
      </section>

      <section class="wf-output-pane">
        <div class="wf-output-tabs">
          <button
            v-for="tab in outputTabs"
            :key="tab.id"
            type="button"
            class="wf-output-tab"
            :class="{ 'wf-output-tab--active': activeOutputTab === tab.id }"
            @click="activeOutputTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
        <WorkflowDefinitionEditor
          v-model="definitionJson"
          :visible="activeOutputTab === 'json'"
          :disabled="!hasDefinition"
          :dirty="definitionDirty"
          :saving="savingDefinition"
          :parse-error="definitionJsonParseError"
          :empty-text="t.workflows.studio.noDefinition"
          @save="saveDefinitionJson"
        />
        <WorkflowMermaidDiagram
          v-show="activeOutputTab === 'flow'"
          :source="mermaidSource"
          @error="onMermaidError"
        />
        <WorkflowEntityFormPreview
          v-show="activeOutputTab === 'entities'"
          entities-md=""
          :entities="parsedEntities"
          @error="onEntityFormErrors"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from 'vue'
import MarkdownIt from 'markdown-it'
import { Chat } from '@teralexi-ai/vue'
import type { UIMessage } from '@teralexi-ai'
import { useI18n } from '@renderer/composables/useI18n'
import RichMessageComposer from '@renderer/views/agent-chat/components/RichMessageComposer.vue'
import ChatUserMessage from '@renderer/views/agent-chat/components/ChatUserMessage.vue'
import ChatAssistantMessageParts from '@renderer/views/agent-chat/components/ChatAssistantMessageParts.vue'
import {
  createRendererChatGenerateId,
  IpcAgentChatTransport,
} from '@renderer/views/agent-chat/IpcAgentChatTransport'
import { createAssistantTextPartHtmlRenderer } from '@renderer/views/agent-chat/components/chat/chatAssistantRender'
import { normalizeChatMessagesForDisplay } from '@renderer/views/agent-chat/components/chat/chatMessageNormalize'
import { DEFAULT_USER_ID } from '@store/agent/config'
import {
  WORKFLOW_COMPILER_AGENT_ID,
  toRunWorkflowCompilerAgentIpcArgs,
  workflowStudioConversationId,
} from '@shared/workflows/workflow-studio'
import { workflowDefinitionToMermaid } from '@shared/workflows/mermaid'
import {
  mergeWorkflowSourceJson,
  safeParseWorkflowDefinitionJson,
  serializeWorkflowDefinition,
} from '@shared/workflows/definition-serialization'
import WorkflowDefinitionEditor from './components/WorkflowDefinitionEditor.vue'
import WorkflowMermaidDiagram from './components/WorkflowMermaidDiagram.vue'
import WorkflowEntityFormPreview from './components/WorkflowEntityFormPreview.vue'
import type { WorkflowBusinessEntity } from '@shared/workflows/schema'
import '@renderer/views/agent-chat/components/chat/markdown-preview.css'

type Snapshot = {
  workflow: { name: string; currentVersionId: string | null }
  versions: Array<{
    id: string
    definitionJson: string
    mermaid: string
    compilerMetadataJson?: string
  }>
  sourceFiles?: {
    workflowDefinitionJson: string
    entitiesDefinitionJson: string
  }
} | null

const props = defineProps<{
  workflowId: string
  snapshot: Snapshot
}>()

const emit = defineEmits<{
  compiled: []
  confirmed: []
}>()

const { t } = useI18n()
const toast = useToast()
const draft = ref('')
const confirming = ref(false)
const messagesEl = ref<HTMLElement | null>(null)
const chatInst = shallowRef<InstanceType<typeof Chat> | null>(null)
const reactiveMessages = ref<UIMessage[]>([])
const chatGenerateId = createRendererChatGenerateId()
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
const assistantTextPartHtml = createAssistantTextPartHtmlRenderer({
  markdown,
  getStructuredDebug: () => false,
})
const definitionJson = ref('{}')
const mermaidSource = ref('')
const parsedEntities = ref<WorkflowBusinessEntity[] | undefined>(undefined)
const mermaidRenderError = ref<string | null>(null)
const entityFormErrors = ref<string[]>([])
const latestCompileVersionId = ref<string | null>(null)
const compileValidationMessages = ref<Array<{ kind: 'error' | 'warn'; text: string }>>([])
const validationMessages = ref<Array<{ kind: 'error' | 'warn'; text: string }>>([])
const savedDefinitionJson = ref('{}')
const savingDefinition = ref(false)
const definitionJsonParseError = ref<string | null>(null)
const activeOutputTab = ref<'json' | 'flow' | 'entities'>('flow')

const definitionDirty = computed(
  () => definitionJson.value !== savedDefinitionJson.value,
)

function syncDefinitionJsonParseError(json: string) {
  if (!json.trim()) {
    definitionJsonParseError.value = null
    return
  }
  try {
    JSON.parse(json)
    definitionJsonParseError.value = null
  } catch (err) {
    definitionJsonParseError.value =
      err instanceof Error ? err.message : t.value.workflows.studio.invalidJson
  }
}

watch(definitionJson, (json) => {
  syncDefinitionJsonParseError(json)
})

const outputTabs = computed(() => [
  { id: 'flow' as const, label: t.value.workflows.studio.mermaid },
  { id: 'entities' as const, label: t.value.workflows.studio.entities },
  { id: 'json' as const, label: t.value.workflows.studio.definition },
])

function onMermaidError(message: string | null) {
  mermaidRenderError.value = message
  syncValidationAlerts()
}

function onEntityFormErrors(messages: string[]) {
  entityFormErrors.value = messages
  syncValidationAlerts()
}

function syncValidationAlerts() {
  const renderMsgs: Array<{ kind: 'error' | 'warn'; text: string }> = []
  for (const text of entityFormErrors.value) {
    renderMsgs.push({ kind: 'error', text: `entities: ${text}` })
  }
  if (mermaidRenderError.value) {
    renderMsgs.push({ kind: 'error', text: `Mermaid: ${mermaidRenderError.value}` })
  }
  validationMessages.value = [...compileValidationMessages.value, ...renderMsgs]
}

const conversationId = computed(() => workflowStudioConversationId(props.workflowId))

const chatStatus = computed(() => {
  const c = chatInst.value as unknown as {
    state?: { statusRef?: { value: string } }
  }
  return c?.state?.statusRef?.value ?? 'ready'
})

const isBusy = computed(() =>
  ['submitted', 'streaming'].includes(chatStatus.value),
)

const visibleMessages = computed(() => reactiveMessages.value)

const thinkingAssistantMessageId = computed(() => {
  if (!isBusy.value) return null
  const msgs = reactiveMessages.value
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === 'assistant') return msgs[i].id
  }
  return null
})

function createWelcomeMessage(text: string): UIMessage {
  return {
    id: 'wf-welcome',
    role: 'assistant',
    parts: [{ type: 'text', text, state: 'done' }],
  }
}

function syncMessagesFromChat(msgs?: UIMessage[]) {
  reactiveMessages.value = normalizeChatMessagesForDisplay(msgs ?? [])
}

const transport = new IpcAgentChatTransport({
  getRunContext: () => ({
    conversationId: conversationId.value,
    agentId: WORKFLOW_COMPILER_AGENT_ID,
    userId: DEFAULT_USER_ID,
  }),
  persistUserMessage: async () => {},
  invokeRunAgent: async ({
    conversationId: cid,
    assistantMessageId,
    userId,
    pendingUserMessage,
  }) => {
    const compileHints = {
      mermaidError: mermaidRenderError.value,
      entityErrors: [...entityFormErrors.value],
      validationErrors: [
        ...compileValidationMessages.value.map((m) => m.text),
        ...validationMessages.value
          .filter((m) => m.kind === 'error')
          .map((m) => m.text),
      ],
    }
    compileValidationMessages.value = []
    validationMessages.value = []
    const invoke = window.ipcRendererChannel?.RunWorkflowCompilerAgent?.invoke
    if (!invoke) {
      throw new Error('RunWorkflowCompilerAgent IPC not available')
    }
    const result = await invoke(
      toRunWorkflowCompilerAgentIpcArgs({
        conversationId: cid,
        workflowId: props.workflowId,
        assistantMessageId,
        userId,
        pendingUserMessage,
        baseVersionId: latestVersionId.value ?? undefined,
        compileHints,
      }),
    )
    if (!result) {
      return {
        finalContent: '',
        hasError: true,
        errorMessage: 'Workflow compile returned no response',
      }
    }
    return result
  },
  onStreamLifecycle(_cid, phase) {
    if (phase === 'end') {
      void scrollToBottom()
    }
  },
  onStreamUiChunk() {
    const inst = chatInst.value as unknown as {
      state?: { messagesRef?: { value: UIMessage[] } }
    }
    syncMessagesFromChat(inst?.state?.messagesRef?.value)
  },
})

function createChatForWorkflow(initial: UIMessage[]): InstanceType<typeof Chat> {
  return new Chat<UIMessage>({
    id: conversationId.value,
    messages: initial,
    generateId: chatGenerateId,
    transport,
    async onFinish({ isAbort }) {
      if (!isAbort) {
        emit('compiled')
      }
      await scrollToBottom()
    },
  })
}

function rebuildChat() {
  const welcome = createWelcomeMessage(t.value.workflows.studio.welcome)
  const chat = createChatForWorkflow([welcome])
  chatInst.value = chat
  syncMessagesFromChat(chat.messages)
}

const latestVersion = computed(() => props.snapshot?.versions[0] ?? null)
const latestVersionId = computed(
  () =>
    latestCompileVersionId.value ??
    latestVersion.value?.id ??
    props.snapshot?.workflow.currentVersionId,
)
const hasDefinition = computed(() => Boolean(latestVersionId.value))

function applyDefinitionJson(json: string, mermaidFallback?: string) {
  if (!json.trim()) return
  const parsed = safeParseWorkflowDefinitionJson(json)
  if (!parsed.success) {
    definitionJsonParseError.value = parsed.errors.join('; ')
    parsedEntities.value = undefined
    return
  }
  const def = parsed.data
  definitionJson.value = serializeWorkflowDefinition(def).trimEnd()
  savedDefinitionJson.value = definitionJson.value
  syncDefinitionJsonParseError(definitionJson.value)
  mermaidSource.value = mermaidFallback?.trim() || workflowDefinitionToMermaid(def)
  parsedEntities.value = def.entities
}

function mergedJsonFromSourceFiles(
  source?: Snapshot['sourceFiles'],
): string | null {
  if (!source?.workflowDefinitionJson?.trim()) return null
  const merged = mergeWorkflowSourceJson(
    source.workflowDefinitionJson,
    source.entitiesDefinitionJson ?? '',
  )
  if (!merged.success) return null
  return serializeWorkflowDefinition(merged.data).trimEnd()
}

function syncOutputFromSnapshot(snap: Snapshot) {
  const sourceJson = mergedJsonFromSourceFiles(snap?.sourceFiles)
  if (sourceJson?.trim()) {
    applyDefinitionJson(sourceJson, snap?.versions[0]?.mermaid)
    return
  }
  syncOutputFromVersion(snap?.versions[0] ?? null)
}

function syncOutputFromVersion(
  version: {
    definitionJson: string
    mermaid: string
    compilerMetadataJson?: string
  } | null,
) {
  if (!version) {
    definitionJson.value = '{}'
    savedDefinitionJson.value = '{}'
    mermaidSource.value = ''
    parsedEntities.value = undefined
    return
  }
  applyDefinitionJson(version.definitionJson, version.mermaid)
}

function resetConversation() {
  draft.value = ''
  compileValidationMessages.value = []
  validationMessages.value = []
  latestCompileVersionId.value = null
  rebuildChat()
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => props.workflowId,
  () => {
    resetConversation()
    syncOutputFromSnapshot(props.snapshot)
  },
  { immediate: true },
)

watch(
  () => props.snapshot,
  (snap) => {
    const version = snap?.versions[0] ?? null
    if (version?.id) {
      latestCompileVersionId.value = version.id
    }
    syncOutputFromSnapshot(snap)
    if (version?.compilerMetadataJson) {
      try {
        const meta = JSON.parse(version.compilerMetadataJson) as {
          sourceErrors?: {
            definition?: string[]
            mermaid?: string | null
          }
        }
        const sourceErrors = meta.sourceErrors
        if (sourceErrors) {
          entityFormErrors.value = [...(sourceErrors.definition ?? [])]
          mermaidRenderError.value = sourceErrors.mermaid ?? null
          syncValidationAlerts()
        }
      } catch {
        /* ignore metadata parse errors */
      }
    }
  },
  { immediate: true },
)

watchEffect(() => {
  const inst = chatInst.value as unknown as {
    state?: { messagesRef?: { value: UIMessage[] } }
  }
  const msgs = inst?.state?.messagesRef?.value
  if (msgs) syncMessagesFromChat(msgs)
})

watch(isBusy, (busy) => {
  if (busy) void scrollToBottom()
})

async function onSubmit() {
  const text = draft.value.trim()
  if (!text || isBusy.value) return
  if (!chatInst.value) rebuildChat()
  draft.value = ''
  await chatInst.value!.sendMessage({ text })
  await scrollToBottom()
}

function onStop() {
  void chatInst.value?.stop()
}

async function saveDefinitionJson() {
  if (!hasDefinition.value || savingDefinition.value || definitionJsonParseError.value) {
    return
  }

  savingDefinition.value = true
  try {
    const result = await window.ipcRendererChannel?.SaveWorkflowDefinitionJson?.invoke({
      userId: 'default',
      workflowId: props.workflowId,
      definitionJson: definitionJson.value,
      baseVersionId: latestVersionId.value ?? undefined,
    })

    if (!result) {
      throw new Error(t.value.workflows.studio.saveDefinitionFailed)
    }

    latestCompileVersionId.value = result.versionId
    definitionJson.value = JSON.stringify(result.definition, null, 2)
    savedDefinitionJson.value = definitionJson.value
    syncDefinitionJsonParseError(definitionJson.value)
    mermaidSource.value = result.mermaid
    parsedEntities.value = result.definition.entities

    compileValidationMessages.value = [
      ...result.validationErrors.map((text) => ({ kind: 'error' as const, text })),
      ...result.validationWarnings.map((text) => ({ kind: 'warn' as const, text })),
    ]
    syncValidationAlerts()

    toast.add({
      title: t.value.workflows.studio.definitionSaved,
      color: result.validationErrors.length > 0 ? 'warning' : 'success',
    })
    emit('compiled')
  } catch (err) {
    toast.add({
      title: t.value.workflows.studio.saveDefinitionFailed,
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  } finally {
    savingDefinition.value = false
  }
}

async function confirm() {
  const versionId = latestVersionId.value
  if (!versionId) return
  confirming.value = true
  try {
    await window.ipcRendererChannel?.ConfirmWorkflowVersion?.invoke({
      userId: 'default',
      workflowId: props.workflowId,
      versionId,
    })
    toast.add({
      title: t.value.workflows.studio.confirmed,
      color: 'success',
    })
    emit('confirmed')
  } catch (err) {
    toast.add({
      title: t.value.workflows.studio.confirmFailed,
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.wf-studio {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.wf-studio-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 0;
  flex-shrink: 0;
}
.wf-confirm-btn {
  width: auto;
  flex-shrink: 0;
}
.wf-studio-body {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  gap: 0;
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--ui-border);
  margin-top: 12px;
}
.wf-chat-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--ui-border);
}
.wf-chat-header {
  flex-shrink: 0;
  padding: 10px 16px 0;
}
.wf-chat-header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-text-muted);
  flex-shrink: 0;
}
.status-dot--streaming {
  background: var(--ui-primary);
  animation: wf-status-pulse 1.2s ease-in-out infinite;
}
@keyframes wf-status-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
.wf-chat-messages {
  flex: 1;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wf-chat-row {
  display: flex;
}
.wf-chat-row--user {
  justify-content: flex-end;
}
.wf-chat-row--assistant {
  justify-content: flex-start;
}
.wf-chat-messages :deep(.assistant-msg-parts),
.wf-chat-messages :deep(.msg-row--user) {
  max-width: min(92%, 520px);
}
.wf-chat-composer {
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg);
}
.wf-chat-composer .composer-shell {
  position: relative;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-bg-elevated);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ui-text) 6%, transparent);
  transition:
    border-color 0.14s ease,
    box-shadow 0.14s ease,
    background-color 0.14s ease;
}
.wf-chat-composer .composer-shell:focus-within {
  border-color: color-mix(in srgb, var(--color-primary-500) 46%, var(--ui-border));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-primary-500) 14%, transparent),
    0 6px 18px color-mix(in srgb, var(--color-primary-500) 10%, transparent);
}
.wf-chat-composer .composer-shell :deep(.rich-composer) {
  position: relative;
  z-index: 0;
}
.wf-chat-composer .composer-send {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 1;
}
.wf-chat-composer .composer-send:disabled {
  opacity: 0.45;
}
.wf-chat-composer .composer-shell:has(.rich-composer--picker-open) .composer-send {
  z-index: 0;
}
.wf-output-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.wf-output-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--ui-border);
  flex-shrink: 0;
}
.wf-output-tab {
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}
.wf-output-tab:hover {
  color: var(--ui-text);
}
.wf-output-tab--active {
  border-bottom-color: var(--ui-primary);
  color: var(--ui-text);
  font-weight: 600;
}
.wf-alerts {
  flex: 1;
  min-width: 0;
}
.wf-error {
  color: var(--ui-error);
  font-size: 0.8125rem;
  margin: 0 0 4px;
}
.wf-warn {
  color: var(--ui-warning);
  font-size: 0.8125rem;
  margin: 0 0 4px;
}
.wf-btn {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  cursor: pointer;
  background: var(--ui-bg);
}
.wf-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.wf-btn--primary {
  background: var(--ui-primary);
  color: white;
  border-color: transparent;
}
</style>
