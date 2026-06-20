import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
  type Ref,
} from 'vue'

function screenBoundsForEl(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(window.screenX + r.left),
    y: Math.round(window.screenY + r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  }
}

/** Mount the native sandbox output WebViewer over `hostRef` for `fileUrl`. */
export function useSandboxOutputView(
  hostRef: Ref<HTMLElement | null>,
  fileUrl: Ref<string | null | undefined>,
) {
  async function syncSandboxOutputBounds() {
    const ipc = window.ipcRendererChannel?.SyncSandboxOutputView
    if (!ipc?.invoke) return
    const host = hostRef.value
    if (!host) {
      await ipc.invoke({
        screenBounds: { x: 0, y: 0, width: 0, height: 0 },
        fileUrl: null,
      })
      return
    }
    await ipc.invoke({
      screenBounds: screenBoundsForEl(host),
      fileUrl: fileUrl.value?.trim() || null,
    })
  }

  async function clearSandboxOutputView() {
    const ipc = window.ipcRendererChannel?.SyncSandboxOutputView
    await ipc?.invoke?.({
      screenBounds: { x: 0, y: 0, width: 0, height: 0 },
      fileUrl: null,
    })
  }

  let sandboxResizeObserver: ResizeObserver | null = null

  function attachSandboxResizeObserver() {
    sandboxResizeObserver?.disconnect()
    sandboxResizeObserver = new ResizeObserver(() => {
      void syncSandboxOutputBounds()
    })
    if (hostRef.value) {
      sandboxResizeObserver.observe(hostRef.value)
    }
  }

  function onWindowResize() {
    void syncSandboxOutputBounds()
  }

  watch(
    fileUrl,
    async () => {
      await nextTick()
      attachSandboxResizeObserver()
      await syncSandboxOutputBounds()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    window.addEventListener('resize', onWindowResize)
    void nextTick(() => {
      attachSandboxResizeObserver()
      void syncSandboxOutputBounds()
    })
  })

  onBeforeUnmount(() => {
    sandboxResizeObserver?.disconnect()
    window.removeEventListener('resize', onWindowResize)
    void clearSandboxOutputView()
  })

  return { syncSandboxOutputBounds, clearSandboxOutputView }
}
