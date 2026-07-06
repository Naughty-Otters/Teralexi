import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import ChatCollectFormCard from '@renderer/views/agent-chat/components/ChatCollectFormCard.vue'
import ChatToolApprovalCard from '@renderer/views/agent-chat/components/ChatToolApprovalCard.vue'
import { collectFormRequestChunk } from '../ipc/stream-fixtures'
import { flushPromises, mountAppHarness, teardownAppHarness, vueGlobalStubs } from './mount-app'

export type MountedHitlHarness = {
  wrapper: VueWrapper
  pinia: Pinia
  router: Router
}

export function mountCollectFormCard(
  options: {
    messageId?: string
    requestId?: string
    disabled?: boolean
  } = {},
): MountedHitlHarness {
  const { pinia, router } = mountAppHarness()
  const part = collectFormRequestChunk(
    {
      conversationId: 'conv-hitl',
      assistantId: 'assistant-1',
    },
    { requestId: options.requestId ?? 'collect-form-1' },
  ).chunk

  const wrapper = mount(ChatCollectFormCard, {
    props: {
      messageId: options.messageId ?? 'assistant-1',
      part,
      disabled: options.disabled ?? false,
    },
    global: {
      plugins: [pinia, router],
      stubs: vueGlobalStubs,
    },
  })

  return { wrapper, pinia, router }
}

export function mountToolApprovalCard(
  options: {
    messageId?: string
    approvalId?: string
    disabled?: boolean
  } = {},
): MountedHitlHarness {
  const { pinia, router } = mountAppHarness()
  const part = {
    type: 'tool-read_file',
    state: 'approval-requested',
    toolCallId: 'tool-call-1',
    input: { path: 'README.md' },
  }

  const wrapper = mount(ChatToolApprovalCard, {
    props: {
      part,
      conversationId: 'conv-hitl',
    },
    global: {
      plugins: [pinia, router],
      stubs: {
        ...vueGlobalStubs,
        ShikiCodeBlock: { template: '<pre class="shiki-stub" />' },
        FileChangeStack: { template: '<div class="file-change-stub" />' },
        ChatTodoChecklist: { template: '<div class="todo-checklist-stub" />' },
      },
    },
  })

  return { wrapper, pinia, router }
}

const ChatPanelShell = defineComponent({
  name: 'ChatPanelShell',
  props: {
    visibleText: {
      type: String,
      default: '',
    },
    isBusy: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () =>
      h('div', { class: 'chat-panel-shell' }, [
        h('div', { class: 'chat-panel-shell__busy' }, String(props.isBusy)),
        h('div', { class: 'chat-panel-shell__text' }, props.visibleText),
      ])
  },
})

/** Lightweight ChatPanel stand-in for integration wiring tests. */
export function mountChatPanelShell(
  options: {
    visibleText?: string
    isBusy?: boolean
  } = {},
): MountedHitlHarness {
  const { pinia, router } = mountAppHarness()
  const wrapper = mount(ChatPanelShell, {
    props: {
      visibleText: options.visibleText ?? '',
      isBusy: options.isBusy ?? false,
    },
    global: {
      plugins: [pinia, router],
    },
  })
  return { wrapper, pinia, router }
}

export async function settleUi(): Promise<void> {
  await flushPromises()
}
