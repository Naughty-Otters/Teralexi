import { computed, onBeforeUnmount, ref, watch, type WatchStopHandle } from 'vue'

/**
 * Ref-count of UI overlays (modals, etc.) that must sit above the Electron
 * sandbox WebContentsView. Native child views ignore CSS z-index, so ReportPanel
 * clears the preview while this count is > 0.
 */
const suppressCount = ref(0)

export const sandboxPreviewSuppressed = computed(() => suppressCount.value > 0)

export function suppressSandboxPreview(): void {
  suppressCount.value += 1
}

export function releaseSandboxPreviewSuppress(): void {
  suppressCount.value = Math.max(0, suppressCount.value - 1)
}

/**
 * Keep sandbox preview suppressed while `active` is true.
 * Auto-releases on deactivate and when the caller stops watching.
 */
export function watchSandboxPreviewSuppress(
  active: () => boolean,
): WatchStopHandle {
  let held = false
  const stop = watch(
    active,
    (isActive) => {
      if (isActive && !held) {
        suppressSandboxPreview()
        held = true
      } else if (!isActive && held) {
        releaseSandboxPreviewSuppress()
        held = false
      }
    },
    { immediate: true },
  )
  return () => {
    stop()
    if (held) {
      releaseSandboxPreviewSuppress()
      held = false
    }
  }
}

/** Vue setup helper: suppress while `active` stays true for this component. */
export function useSandboxPreviewSuppress(active: () => boolean): void {
  const stop = watchSandboxPreviewSuppress(active)
  onBeforeUnmount(stop)
}
