import { ref } from 'vue'

/** Set by AgentChat when main process intercepts an in-window file:// navigation. */
export const sandboxPreviewRequest = ref<string | null>(null)

export function requestSandboxPreview(url: string): void {
  sandboxPreviewRequest.value = url
}
