import { onBeforeUnmount, ref, type Ref } from 'vue'

export type HorizontalPanelMaxSize =
  | number
  | { fraction: number; reservePx?: number }

export type HorizontalPanelResizeOptions = {
  /** Measured against this element's bounding box. */
  containerRef: Ref<HTMLElement | null>
  /** `start` = left panel width; `end` = right panel width. */
  panelSide: 'start' | 'end'
  defaultSize: number
  minSize: number
  /** Fixed max or fraction of container width (0–1), optionally reserving peer space. */
  maxSize: HorizontalPanelMaxSize
  storageKey?: string
  enabled?: Ref<boolean>
}

/** Minimal width left for the adjacent panel when a split panel is maximized. */
export const SPLIT_PANEL_PEER_MIN_PX = 48

function readStoredSize(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function resolveMaxSize(
  container: HTMLElement,
  maxSize: HorizontalPanelMaxSize,
  minSize: number,
): number {
  if (typeof maxSize === 'number') return maxSize
  const reserve = maxSize.reservePx ?? 0
  const fromFraction = container.clientWidth * maxSize.fraction
  return Math.max(minSize, fromFraction - reserve)
}

export function useHorizontalPanelResize(options: HorizontalPanelResizeOptions) {
  const sizePx = ref(
    options.storageKey
      ? readStoredSize(options.storageKey, options.defaultSize)
      : options.defaultSize,
  )
  const isResizing = ref(false)

  let activePointerId: number | null = null

  function clampSize(next: number): number {
    const container = options.containerRef.value
    if (!container) {
      return Math.max(options.minSize, Math.min(next, options.defaultSize))
    }
    const max = resolveMaxSize(container, options.maxSize, options.minSize)
    return Math.max(options.minSize, Math.min(next, max))
  }

  function setSize(next: number) {
    sizePx.value = clampSize(next)
    if (options.storageKey) {
      try {
        localStorage.setItem(options.storageKey, String(sizePx.value))
      } catch {
        /* ignore quota */
      }
    }
  }

  function sizeFromPointer(clientX: number): number {
    const container = options.containerRef.value
    if (!container) return sizePx.value
    const rect = container.getBoundingClientRect()
    return options.panelSide === 'start'
      ? clientX - rect.left
      : rect.right - clientX
  }

  function onPointerMove(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return
    if (options.enabled && !options.enabled.value) return
    setSize(sizeFromPointer(event.clientX))
  }

  function endResize(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return
    activePointerId = null
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endResize)
    window.removeEventListener('pointercancel', endResize)
  }

  function onResizePointerDown(event: PointerEvent) {
    if (options.enabled && !options.enabled.value) return
    if (event.button !== 0) return
    event.preventDefault()
    activePointerId = event.pointerId
    isResizing.value = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setSize(sizeFromPointer(event.clientX))
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endResize)
    window.addEventListener('pointercancel', endResize)
  }

  onBeforeUnmount(() => {
    if (activePointerId != null) {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endResize)
      window.removeEventListener('pointercancel', endResize)
    }
  })

  return {
    sizePx,
    isResizing,
    onResizePointerDown,
    setSize,
  }
}
