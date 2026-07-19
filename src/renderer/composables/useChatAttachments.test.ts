/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useChatAttachments } from './useChatAttachments'

describe('useChatAttachments negative paths', () => {
  let scope: ReturnType<typeof effectScope>

  afterEach(() => {
    scope?.stop()
    delete (window as typeof window & { ipcRendererChannel?: unknown })
      .ipcRendererChannel
  })

  it('sets error when PickChatAttachments IPC rejects', async () => {
    ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
      {
        PickChatAttachments: {
          invoke: vi.fn(async () => {
            throw new Error('Dialog failed')
          }),
        },
      }

    scope = effectScope(true)
    const conversationId = ref('conv-1')
    const api = scope.run(() => useChatAttachments({ conversationId }))!

    await api.pickAttachments()

    expect(api.picking.value).toBe(false)
    expect(api.error.value).toBe('Dialog failed')
    expect(api.staged.value).toEqual([])
  })

  it('sets error when PickChatAttachments returns ok:false', async () => {
    ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
      {
        PickChatAttachments: {
          invoke: vi.fn(async () => ({
            ok: false,
            error: 'User cancelled',
          })),
        },
      }

    scope = effectScope(true)
    const conversationId = ref('conv-1')
    const api = scope.run(() => useChatAttachments({ conversationId }))!

    await api.pickAttachments()

    expect(api.error.value).toBe('User cancelled')
  })

  it('sets error when attachment channel is missing', async () => {
    ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
      {}

    scope = effectScope(true)
    const conversationId = ref('conv-1')
    const api = scope.run(() => useChatAttachments({ conversationId }))!

    await api.pickAttachments()

    expect(api.error.value).toBe('File attachments are not available.')
  })
})
