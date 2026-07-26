import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { UIMessage } from '@teralexi-ai'

import { chatUiPerfMark, chatUiPerfMarkEnd } from './perf/chatUiPerf'

export const CHAT_MESSAGE_PAGE_SIZE = 25
export const CHAT_MESSAGE_WINDOW_MAX = 50
export const CHAT_SCROLL_EDGE_THRESHOLD_PX = 100

/**
 * Virtual list integration is deferred until rolling-window DOM caps are
 * insufficient under profiling. Windowing is enabled via {@link CHAT_MESSAGE_WINDOW_MAX}.
 */
export const CHAT_VIRTUAL_LIST_ENABLED = false

type ScrollWindowOptions = {
  pageSize?: number
  windowMax?: number
  onLoadOlder?: () => Promise<boolean>
  hasOlderOnServer?: () => boolean
  /** Observed for height changes (e.g. streaming bubbles). Falls back to scrollEl. */
  contentEl?: Ref<HTMLElement | null>
}

type PreserveScrollOptions = {
  /** Keep scrollTop at 0 after prepending content above the viewport. */
  pinToTop?: boolean
}

type ScrollMetrics = {
  scrollHeight: number
  clientHeight: number
}

/**
 * Scroll helper for the chat message list. While stuck to bottom, only the
 * trailing {@link CHAT_MESSAGE_WINDOW_MAX} messages are mounted. Scrolling to
 * the top fetches older pages from the store.
 */
export function useChatMessageScrollWindow(
  messages: Ref<UIMessage[]>,
  scrollEl: Ref<HTMLElement | null>,
  options: ScrollWindowOptions = {},
) {
  const pageSize = options.pageSize ?? CHAT_MESSAGE_PAGE_SIZE
  const windowMax = options.windowMax ?? CHAT_MESSAGE_WINDOW_MAX
  const stickToBottom = ref(true)
  const isLoadingOlder = ref(false)
  /** When true, show the full in-memory list (user scrolled up / loading older). */
  const showFullHistory = ref(false)
  let lastScrollTop = 0
  let userDetachedFromBottom = false
  let isPreservingScroll = false
  let wasNearTop = false
  let cachedMetrics: ScrollMetrics | null = null
  let stickScrollRaf: number | null = null
  let stickScrollScheduled = false
  let metricsFromObserver = false

  function readDomMetrics(el: HTMLElement): ScrollMetrics {
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }
  }

  function getMetrics(el: HTMLElement, force = false): ScrollMetrics {
    if (!force && cachedMetrics && metricsFromObserver) {
      return cachedMetrics
    }
    cachedMetrics = readDomMetrics(el)
    return cachedMetrics
  }

  function invalidateMetrics(): void {
    cachedMetrics = null
    metricsFromObserver = false
  }

  function updateMetricsFromObserver(
    el: HTMLElement,
    entry?: ResizeObserverEntry,
  ): void {
    const box = entry?.contentBoxSize?.[0]
    if (box) {
      cachedMetrics = {
        scrollHeight: el.scrollHeight,
        clientHeight: box.blockSize,
      }
      metricsFromObserver = true
      return
    }
    if (entry?.contentRect) {
      cachedMetrics = {
        scrollHeight: el.scrollHeight,
        clientHeight: entry.contentRect.height,
      }
      metricsFromObserver = true
      return
    }
    cachedMetrics = readDomMetrics(el)
    metricsFromObserver = true
  }

  function isScrollable(el: HTMLElement): boolean {
    const m = getMetrics(el)
    return m.scrollHeight > m.clientHeight + 1
  }

  function isNearBottom(el: HTMLElement): boolean {
    const m = getMetrics(el)
    return m.scrollHeight - el.scrollTop - m.clientHeight < CHAT_SCROLL_EDGE_THRESHOLD_PX
  }

  function isNearTop(el: HTMLElement): boolean {
    return el.scrollTop < CHAT_SCROLL_EDGE_THRESHOLD_PX
  }

  function syncStickToBottom(el: HTMLElement): void {
    if (userDetachedFromBottom) {
      if (isScrollable(el) && isNearBottom(el) && !isNearTop(el)) {
        userDetachedFromBottom = false
        stickToBottom.value = true
        showFullHistory.value = false
      } else {
        stickToBottom.value = false
      }
      return
    }
    stickToBottom.value = isScrollable(el) && isNearBottom(el)
    if (stickToBottom.value) showFullHistory.value = false
  }

  const visibleMessages = computed(() => {
    const all = messages.value
    if (showFullHistory.value || !stickToBottom.value) return all
    if (all.length <= windowMax) return all
    return all.slice(-windowMax)
  })

  const hasHiddenAbove = computed(() => {
    if (options.hasOlderOnServer?.()) return true
    if (showFullHistory.value || !stickToBottom.value) return false
    return messages.value.length > windowMax
  })

  const hasHiddenBelow = computed(() => false)

  function resetWindow(anchorBottom = true): void {
    lastScrollTop = 0
    wasNearTop = false
    invalidateMetrics()
    if (anchorBottom) {
      userDetachedFromBottom = false
      stickToBottom.value = true
      showFullHistory.value = false
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
    const prevHeight = getMetrics(el, true).scrollHeight
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
    invalidateMetrics()
    const nextHeight = getMetrics(el, true).scrollHeight
    el.scrollTop = opts.pinToTop ? 0 : prevTop + (nextHeight - prevHeight)
    lastScrollTop = el.scrollTop
  }

  function maxScrollTop(el: HTMLElement): number {
    const m = getMetrics(el)
    return Math.max(0, m.scrollHeight - m.clientHeight)
  }

  function scrollElementToBottom(el: HTMLElement, behavior: ScrollBehavior): void {
    chatUiPerfMark('scroll')
    const top = maxScrollTop(el)
    if (behavior === 'auto' || behavior === 'instant') {
      el.scrollTop = top
    } else {
      el.scrollTo({ top, behavior })
    }
    lastScrollTop = el.scrollTop
    wasNearTop = top <= CHAT_SCROLL_EDGE_THRESHOLD_PX
    chatUiPerfMarkEnd('scroll')
  }

  function armStickToBottom(): void {
    userDetachedFromBottom = false
    stickToBottom.value = true
    showFullHistory.value = false
  }

  function detachFromBottom(): void {
    userDetachedFromBottom = true
    stickToBottom.value = false
    showFullHistory.value = true
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

    if (!enteredNearTop || isLoadingOlder.value) return

    // Reveal trimmed local history before hitting the server.
    if (!showFullHistory.value && messages.value.length > windowMax) {
      showFullHistory.value = true
      await nextTick()
      invalidateMetrics()
      return
    }

    if (!options.onLoadOlder) return

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
    // Coalesce before awaiting nextTick so concurrent stream flushes share one frame.
    if (stickScrollScheduled) return
    stickScrollScheduled = true
    await nextTick()
    const el = scrollEl.value
    if (!el || !stickToBottom.value) {
      stickScrollScheduled = false
      return
    }

    if (typeof requestAnimationFrame !== 'function') {
      stickScrollScheduled = false
      invalidateMetrics()
      scrollElementToBottom(el, behavior)
      return
    }
    if (stickScrollRaf != null) {
      stickScrollScheduled = false
      return
    }
    stickScrollRaf = requestAnimationFrame(() => {
      stickScrollRaf = null
      stickScrollScheduled = false
      if (!stickToBottom.value) return
      const latest = scrollEl.value
      if (!latest) return
      invalidateMetrics()
      scrollElementToBottom(latest, behavior)
    })
  }

  function startContentAutoScroll(): () => void {
    if (typeof ResizeObserver === 'undefined') {
      return () => {}
    }

    const observedEl = options.contentEl ?? scrollEl
    let observer: ResizeObserver | null = null
    let rafHandle: number | null = null

    const stopWatch = watch(
      observedEl,
      (el, _prev, onCleanup) => {
        observer?.disconnect()
        observer = null
        if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(rafHandle)
        }
        rafHandle = null
        invalidateMetrics()
        if (!el) return

        observer = new ResizeObserver((entries) => {
          const entry = entries[0]
          updateMetricsFromObserver(el, entry)
          if (!stickToBottom.value) return
          if (rafHandle != null) return
          if (typeof requestAnimationFrame !== 'function') {
            void scrollToBottomIfStuck('auto')
            return
          }
          rafHandle = requestAnimationFrame(() => {
            rafHandle = null
            void scrollToBottomIfStuck('auto')
          })
        })
        observer.observe(el)
        updateMetricsFromObserver(el)

        onCleanup(() => {
          observer?.disconnect()
          observer = null
          if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafHandle)
          }
          rafHandle = null
        })
      },
      { immediate: true },
    )

    return () => {
      stopWatch()
      observer?.disconnect()
      if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle)
      }
      if (stickScrollRaf != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(stickScrollRaf)
        stickScrollRaf = null
      }
    }
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
    armStickToBottom,
    scrollToBottomIfStuck,
    startContentAutoScroll,
    /** Test/debug: page size used for older loads. */
    pageSize,
  }
}
