import { describe, expect, it } from 'vitest'
import { ref, nextTick } from 'vue'
import { useChatMessageScrollWindow } from './useChatMessageScrollWindow'

function mockScrollEl(opts: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): HTMLElement {
  const el = {
    scrollTop: opts.scrollTop,
    scrollHeight: opts.scrollHeight,
    clientHeight: opts.clientHeight,
  }
  return el as HTMLElement
}

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i + 1}`,
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: `msg ${i + 1}`, state: 'done' as const }],
  }))
}

describe('useChatMessageScrollWindow', () => {
  it('renders all in-memory messages', async () => {
    const messages = ref(makeMessages(60))
    const scrollEl = ref<HTMLElement | null>(null)
    const { visibleMessages, resetWindow } = useChatMessageScrollWindow(
      messages,
      scrollEl,
    )

    resetWindow(true)
    await nextTick()

    expect(visibleMessages.value).toHaveLength(60)
    expect(visibleMessages.value[0]?.id).toBe('m1')
    expect(visibleMessages.value.at(-1)?.id).toBe('m60')
  })

  it('does not trim visible messages when new messages arrive while scrolled up', async () => {
    const messages = ref(makeMessages(30))
    const scrollEl = ref<HTMLElement | null>(null)
    const { visibleMessages, stickToBottom, resetWindow } =
      useChatMessageScrollWindow(messages, scrollEl)

    resetWindow(true)
    await nextTick()
    expect(visibleMessages.value).toHaveLength(30)

    stickToBottom.value = false
    messages.value = makeMessages(80)
    await nextTick()

    expect(visibleMessages.value).toHaveLength(80)
    expect(visibleMessages.value[0]?.id).toBe('m1')
  })

  it('detaches from bottom when the user scrolls up via wheel', async () => {
    const messages = ref(makeMessages(5))
    const scrollEl = ref<HTMLElement | null>(null)
    const { stickToBottom, resetWindow, onWheel } = useChatMessageScrollWindow(
      messages,
      scrollEl,
    )

    resetWindow(true)
    await nextTick()
    expect(stickToBottom.value).toBe(true)

    onWheel({ deltaY: -1 } as WheelEvent)
    expect(stickToBottom.value).toBe(false)
  })

  it('loads older messages only when entering the top edge', async () => {
    const messages = ref(makeMessages(40))
    const scrollEl = ref<HTMLElement | null>(null)
    let loadCount = 0
    const { resetWindow, onScroll } = useChatMessageScrollWindow(
      messages,
      scrollEl,
      {
        onLoadOlder: async () => {
          loadCount += 1
          return true
        },
        hasOlderOnServer: () => true,
      },
    )

    resetWindow(true)
    await nextTick()

    scrollEl.value = mockScrollEl({
      scrollTop: 500,
      scrollHeight: 2_000,
      clientHeight: 600,
    })
    await onScroll()
    expect(loadCount).toBe(0)

    scrollEl.value.scrollTop = 10
    await onScroll()
    expect(loadCount).toBe(1)

    scrollEl.value.scrollTop = 5
    await onScroll()
    expect(loadCount).toBe(1)
  })

  it('pins scroll to the top when loading older messages from the physical top', async () => {
    const messages = ref(makeMessages(40))
    const scrollEl = ref<HTMLElement | null>(null)
    const el = mockScrollEl({
      scrollTop: 0,
      scrollHeight: 1_000,
      clientHeight: 600,
    })
    scrollEl.value = el

    const { resetWindow, onScroll } = useChatMessageScrollWindow(
      messages,
      scrollEl,
      {
        onLoadOlder: async () => {
          el.scrollHeight = 1_600
          return true
        },
        hasOlderOnServer: () => true,
      },
    )

    resetWindow(true)
    await nextTick()
    await onScroll()

    expect(el.scrollTop).toBe(0)
  })

  it('does not re-enable stick to bottom while reading near the top', async () => {
    const messages = ref(makeMessages(10))
    const scrollEl = ref<HTMLElement | null>(null)
    const { stickToBottom, resetWindow, onWheel, onScroll } =
      useChatMessageScrollWindow(messages, scrollEl)

    resetWindow(true)
    await nextTick()
    onWheel({ deltaY: -1 } as WheelEvent)

    scrollEl.value = mockScrollEl({
      scrollTop: 0,
      scrollHeight: 400,
      clientHeight: 800,
    })

    await onScroll()
    expect(stickToBottom.value).toBe(false)
  })
})
