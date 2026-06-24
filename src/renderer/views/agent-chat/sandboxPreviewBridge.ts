import { ref, watch, type WatchStopHandle } from 'vue'

/** Set by AgentChat when main process intercepts an in-window file:// navigation. */
export const sandboxPreviewRequest = ref<string | null>(null)

export function requestSandboxPreview(url: string): void {
  sandboxPreviewRequest.value = url
}

/** Wires main-process preview navigation requests into the chat report panel. */
export function bindSandboxPreviewRequest(
  onOpen: (url: string) => void,
): WatchStopHandle {
  return watch(sandboxPreviewRequest, (url) => {
    if (!url) return
    onOpen(url)
    sandboxPreviewRequest.value = null
  })
}
