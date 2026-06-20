import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { UIMessage } from '@openfde-ai'

export const CHAT_MESSAGE_PAGE_SIZE = 25
export const CHAT_MESSAGE_WINDOW_MAX = 50
export const CHAT_SCROLL_EDGE_THRESHOLD_PX = 100

/**
 * Virtual list integration is deferred until post-implementation profiling shows
 * rolling-window DOM caps are insufficient. Keep false for the current path.
 */
export const CHAT_VIRTUAL_LIST_ENABLED = false

type ScrollWindowOptions = {
  pageSize?: number
  windowMax?: number
  onLoadOlder?: () => Promise<boolean>
  hasOlderOnServer?: () => boolean
}

type PreserveScrollOptions = {
  /** Keep scrollTop at 0 after prepending content above the viewport. */
  pinToTop?: boolean
}

/**
 * Scroll helper for the chat message list. All messages currently in memory are
 * rendered; only server pagination trims what is loaded. Scrolling to the top
 * fetches older pages from the store.
 */
export function useChatMessageScrollWindow(
  messages: Ref<UIMessage[]>,
  scrollEl: Ref<HTMLElement | null>,
  options: ScrollWindowOptions = {},
) {
  const stickToBottom = ref(true)
  const isLoadingOlder = ref(false)
  let lastScrollTop = 0
  let userDetachedFromBottom = false
  let isPreservingScroll = false
  let wasNearTop = false

  function isScrollable(el: HTMLElement): boolean {
    return el.scrollHeight > el.clientHeight + 1
  }

  function isNearBottom(el: HTMLElement): boolean {
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight <
      CHAT_SCROLL_EDGE_THRESHOLD_PX
    )
  }

  function isNearTop(el: HTMLElement): boolean {
    return el.scrollTop < CHAT_SCROLL_EDGE_THRESHOLD_PX
  }

  function syncStickToBottom(el: HTMLElement): void {
    if (userDetachedFromBottom) {
      if (isScrollable(el) && isNearBottom(el) && !isNearTop(el)) {
        userDetachedFromBottom = false
        stickToBottom.value = true
      } else {
        stickToBottom.value = false
      }
      return
    }
    stickToBottom.value = isScrollable(el) && isNearBottom(el)
  }

  const visibleMessages = computed(() => messages.value)

  const hasHiddenAbove = computed(() =>
    Boolean(options.hasOlderOnServer?.()),
  )

  const hasHiddenBelow = computed(() => false)

  function resetWindow(anchorBottom = true): void {
    lastScrollTop = 0
    wasNearTop = false
    if (anchorBottom) {
      userDetachedFromBottom = false
      stickToBottom.value = true
    }
  }

  watch(
    () => messages.value.length,
    (len) => {
      if (len === 0) {
        resetWindow()
      }
    },
    { immediate: true },
  )

  async function preserveScrollAfter(
    el: HTMLElement,
    mutate: () => void | Promise<void>,
    opts: PreserveScrollOptions = {},
  ): Promise<void> {
    const prevHeight = el.scrollHeight
    const prevTop = el.scrollTop
    await mutate()
    await nextTick()
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve())
        return
      }
      resolve()
    })
    el.scrollTop = opts.pinToTop
      ? 0
      : prevTop + (el.scrollHeight - prevHeight)
    lastScrollTop = el.scrollTop
  }

  function detachFromBottom(): void {
    userDetachedFromBottom = true
    stickToBottom.value = false
  }

  function onWheel(event: WheelEvent): void {
    if (event.deltaY < 0) detachFromBottom()
  }

  async function onScroll(): Promise<void> {
    const el = scrollEl.value
    if (!el || isPreservingScroll) return

    if (el.scrollTop < lastScrollTop - 1) {
      detachFromBottom()
    }
    lastScrollTop = el.scrollTop

    syncStickToBottom(el)

    const nearTop = isNearTop(el)
    const enteredNearTop = nearTop && !wasNearTop
    wasNearTop = nearTop

    if (!enteredNearTop || !options.onLoadOlder || isLoadingOlder.value) return

    isLoadingOlder.value = true
    isPreservingScroll = true
    try {
      await preserveScrollAfter(
        el,
        async () => {
          await options.onLoadOlder?.()
        },
        { pinToTop: true },
      )
    } finally {
      isLoadingOlder.value = false
      isPreservingScroll = false
      wasNearTop = isNearTop(el)
      lastScrollTop = el.scrollTop
    }
  }

  async function scrollToBottomIfStuck(
    behavior: ScrollBehavior = 'smooth',
  ): Promise<void> {
    if (!stickToBottom.value) return
    await nextTick()
    const el = scrollEl.value
    if (!el) return
    const top = el.scrollHeight
    if (behavior === 'auto' || behavior === 'instant') {
      el.scrollTop = top
      lastScrollTop = top
      wasNearTop = false
      return
    }
    el.scrollTo({ top, behavior })
    lastScrollTop = top
    wasNearTop = false
  }

  return {
    visibleMessages,
    hasHiddenAbove,
    hasHiddenBelow,
    isLoadingOlder,
    stickToBottom,
    resetWindow,
    onScroll,
    onWheel,
    detachFromBottom,
    scrollToBottomIfStuck,
  }
}
