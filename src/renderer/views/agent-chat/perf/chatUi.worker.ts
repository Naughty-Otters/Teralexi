import type { UIMessage } from '@teralexi-ai'
import MarkdownIt from 'markdown-it'
import {
  incrementalSyncChatMessages,
  normalizeChatMessagesForDisplay,
} from '../components/chat/chatMessageNormalize'
import { prepareMarkdownSource } from '@shared/markdown/prepare-markdown-source'
import type {
  ChatUiWorkerRequest,
  ChatUiWorkerResponse,
} from './chatUiWorkerProtocol'
import { CHAT_UI_WORKER_PROTOCOL_VERSION } from './chatUiWorkerProtocol'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

function cloneMessages(messages: UIMessage[]): UIMessage[] {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(messages)
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(messages)) as UIMessage[]
}

function handle(req: ChatUiWorkerRequest): ChatUiWorkerResponse {
  try {
    switch (req.op) {
      case 'normalize':
        return {
          v: CHAT_UI_WORKER_PROTOCOL_VERSION,
          id: req.id,
          ok: true,
          op: 'normalize',
          messages: normalizeChatMessagesForDisplay(req.raw),
        }
      case 'incrementalSync':
        return {
          v: CHAT_UI_WORKER_PROTOCOL_VERSION,
          id: req.id,
          ok: true,
          op: 'incrementalSync',
          messages: incrementalSyncChatMessages(req.raw, req.prev),
        }
      case 'cloneSnapshot':
        return {
          v: CHAT_UI_WORKER_PROTOCOL_VERSION,
          id: req.id,
          ok: true,
          op: 'cloneSnapshot',
          messages: cloneMessages(req.messages),
        }
      case 'renderMarkdown': {
        const prepared = prepareMarkdownSource(req.text)
        const html = prepared ? md.render(prepared) : ''
        return {
          v: CHAT_UI_WORKER_PROTOCOL_VERSION,
          id: req.id,
          ok: true,
          op: 'renderMarkdown',
          html,
        }
      }
      default: {
        const _exhaustive: never = req
        void _exhaustive
        return {
          v: CHAT_UI_WORKER_PROTOCOL_VERSION,
          id: (req as { id: number }).id,
          ok: false,
          error: 'unknown op',
        }
      }
    }
  } catch (err) {
    return {
      v: CHAT_UI_WORKER_PROTOCOL_VERSION,
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

self.onmessage = (event: MessageEvent<ChatUiWorkerRequest>) => {
  const req = event.data
  if (!req || req.v !== CHAT_UI_WORKER_PROTOCOL_VERSION) return
  const res = handle(req)
  ;(self as unknown as Worker).postMessage(res)
}
