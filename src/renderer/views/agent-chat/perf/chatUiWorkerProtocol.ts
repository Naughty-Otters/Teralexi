import type { UIMessage } from '@teralexi-ai'

export const CHAT_UI_WORKER_PROTOCOL_VERSION = 1 as const

export type ChatUiWorkerRequest =
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      op: 'normalize'
      raw: UIMessage[]
    }
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      op: 'incrementalSync'
      raw: UIMessage[]
      prev: UIMessage[]
    }
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      op: 'cloneSnapshot'
      messages: UIMessage[]
    }
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      op: 'renderMarkdown'
      text: string
    }

export type ChatUiWorkerResponse =
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      ok: true
      op: 'normalize' | 'incrementalSync' | 'cloneSnapshot'
      messages: UIMessage[]
    }
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      ok: true
      op: 'renderMarkdown'
      html: string
    }
  | {
      v: typeof CHAT_UI_WORKER_PROTOCOL_VERSION
      id: number
      ok: false
      error: string
    }
