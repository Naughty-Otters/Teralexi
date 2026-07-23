import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'

export type ImperativePlainPreOptions = {
  /** Host element Vue owns (must stay empty in the template). */
  hostEl: Ref<HTMLElement | null>
  className: string
  /** Called on user scroll of the imperative <pre>. */
  onScroll?: (event: Event) => void
}

/**
 * Own a plain &lt;pre&gt; outside Vue's VDOM: create/append via DOM APIs and
 * update with `textContent` only. The host node should use `v-once` so Vue
 * never clears the manually attached child.
 */
export function useImperativePlainPre(options: ImperativePlainPreOptions) {
  const preEl = ref<HTMLPreElement | null>(null)
  let painted = ''
  let scrollHandler: ((event: Event) => void) | null = null

  function ensurePre(): HTMLPreElement | null {
    const host = options.hostEl.value
    if (!host) return null
    let pre = preEl.value
    if (pre && pre.isConnected) return pre

    pre = document.createElement('pre')
    pre.className = options.className
    if (options.onScroll) {
      scrollHandler = options.onScroll
      pre.addEventListener('scroll', scrollHandler, { passive: true })
    }
    host.replaceChildren(pre)
    preEl.value = pre
    // Re-apply last paint if the node was recreated.
    if (painted) pre.textContent = painted
    return pre
  }

  function setText(next: string): HTMLPreElement | null {
    const pre = ensurePre()
    if (!pre) {
      painted = next
      return null
    }
    if (painted === next && pre.textContent === next) return pre
    painted = next
    pre.textContent = next
    return pre
  }

  function getPre(): HTMLPreElement | null {
    return preEl.value
  }

  onMounted(() => {
    void nextTick(() => {
      ensurePre()
      if (painted) setText(painted)
    })
  })

  onBeforeUnmount(() => {
    const pre = preEl.value
    if (pre && scrollHandler) {
      pre.removeEventListener('scroll', scrollHandler)
    }
    scrollHandler = null
    preEl.value = null
    options.hostEl.value?.replaceChildren()
  })

  watch(options.hostEl, (host) => {
    if (!host) return
    void nextTick(() => {
      ensurePre()
      if (painted) setText(painted)
    })
  })

  return { setText, getPre, ensurePre }
}
