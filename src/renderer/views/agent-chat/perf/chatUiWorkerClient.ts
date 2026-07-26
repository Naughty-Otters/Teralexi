import type { UIMessage } from '@teralexi-ai'
import {
  incrementalSyncChatMessages,
  normalizeChatMessagesForDisplay,
} from '../components/chat/chatMessageNormalize'
import { chatUiPerfMark, chatUiPerfMarkEnd } from './chatUiPerf'
import {
  CHAT_UI_WORKER_PROTOCOL_VERSION,
  type ChatUiWorkerRequest,
  type ChatUiWorkerResponse,
} from './chatUiWorkerProtocol'
import ChatUiWorkerCtor from './chatUi.worker?worker'

function cloneFallback(messages: UIMessage[]): UIMessage[] {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(messages)
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(messages)) as UIMessage[]
}

export type ChatUiWorkerMode = 'auto' | 'on' | 'off'

let worker: Worker | null = null
let workerFailed = false
let nextId = 1
const pending = new Map<
  number,
  {
    resolve: (value: ChatUiWorkerResponse) => void
    reject: (err: Error) => void
  }
>()

function readMode(): ChatUiWorkerMode {
  try {
    if (typeof localStorage === 'undefined') return 'auto'
    const raw = localStorage.getItem('teralexi.chatUiWorker')
    if (raw === '0' || raw === 'off') return 'off'
    if (raw === '1' || raw === 'on') return 'on'
  } catch {
    // ignore
  }
  return 'auto'
}

function ensureWorker(): Worker | null {
  if (workerFailed) return null
  const mode = readMode()
  if (mode === 'off') return null
  if (worker) return worker
  try {
    worker = new ChatUiWorkerCtor()
    worker.onmessage = (event: MessageEvent<ChatUiWorkerResponse>) => {
      const res = event.data
      const slot = pending.get(res.id)
      if (!slot) return
      pending.delete(res.id)
      slot.resolve(res)
    }
    worker.onerror = () => {
      workerFailed = true
      worker?.terminate()
      worker = null
      for (const [, slot] of pending) {
        slot.reject(new Error('chat UI worker failed'))
      }
      pending.clear()
    }
    return worker
  } catch {
    workerFailed = true
    worker = null
    return null
  }
}

function request(
  body: Omit<ChatUiWorkerRequest, 'v' | 'id'>,
): Promise<ChatUiWorkerResponse> {
  const w = ensureWorker()
  if (!w) {
    return Promise.reject(new Error('chat UI worker unavailable'))
  }
  const id = nextId++
  const req = {
    ...body,
    v: CHAT_UI_WORKER_PROTOCOL_VERSION,
    id,
  } as ChatUiWorkerRequest
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage(req)
  })
}

export function isChatUiWorkerAvailable(): boolean {
  return ensureWorker() != null
}

export async function workerNormalizeChatMessages(
  raw: readonly UIMessage[],
): Promise<UIMessage[]> {
  chatUiPerfMark('worker.roundtrip')
  try {
    const res = await request({ op: 'normalize', raw: [...raw] })
    if (!res.ok || res.op !== 'normalize') {
      throw new Error(!res.ok ? res.error : 'bad normalize response')
    }
    return res.messages
  } catch {
    return normalizeChatMessagesForDisplay(raw)
  } finally {
    chatUiPerfMarkEnd('worker.roundtrip')
  }
}

export async function workerIncrementalSyncChatMessages(
  raw: readonly UIMessage[],
  prev: UIMessage[],
): Promise<UIMessage[]> {
  chatUiPerfMark('worker.roundtrip')
  try {
    const res = await request({
      op: 'incrementalSync',
      raw: [...raw],
      prev,
    })
    if (!res.ok || res.op !== 'incrementalSync') {
      throw new Error(!res.ok ? res.error : 'bad incrementalSync response')
    }
    return res.messages
  } catch {
    return incrementalSyncChatMessages(raw, prev)
  } finally {
    chatUiPerfMarkEnd('worker.roundtrip')
  }
}

export async function workerCloneUiMessages(
  messages: UIMessage[],
): Promise<UIMessage[]> {
  chatUiPerfMark('worker.roundtrip')
  try {
    const res = await request({ op: 'cloneSnapshot', messages })
    if (!res.ok || res.op !== 'cloneSnapshot') {
      throw new Error(!res.ok ? res.error : 'bad cloneSnapshot response')
    }
    return res.messages
  } catch {
    return cloneFallback(messages)
  } finally {
    chatUiPerfMarkEnd('worker.roundtrip')
  }
}

export async function workerRenderMarkdown(text: string): Promise<string> {
  chatUiPerfMark('worker.roundtrip')
  try {
    const res = await request({ op: 'renderMarkdown', text })
    if (!res.ok || res.op !== 'renderMarkdown') {
      throw new Error(!res.ok ? res.error : 'bad renderMarkdown response')
    }
    return res.html
  } catch {
    return ''
  } finally {
    chatUiPerfMarkEnd('worker.roundtrip')
  }
}

/** Sync path used on the UI thread when the worker is off or for tiny payloads. */
export function syncNormalizeChatMessages(
  raw: readonly UIMessage[],
): UIMessage[] {
  return normalizeChatMessagesForDisplay(raw)
}

export function syncIncrementalSyncChatMessages(
  raw: readonly UIMessage[],
  prev: UIMessage[],
): UIMessage[] {
  return incrementalSyncChatMessages(raw, prev)
}

export function resetChatUiWorkerForTests(): void {
  worker?.terminate()
  worker = null
  workerFailed = false
  pending.clear()
  nextId = 1
}
