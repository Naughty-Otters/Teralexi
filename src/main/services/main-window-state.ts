import { getSystemPropValues, setSystemPropValue } from '@config/system-prop'
import {
  MAIN_WINDOW_BOUNDS_PROP_KEYS,
  clampMainWindowSize,
  parseMainWindowBounds,
  serializeMainWindowBounds,
  type MainWindowBounds,
} from '@shared/ui/main-window-state'
import { BrowserWindow, screen, type Rectangle } from 'electron'

const SAVE_DEBOUNCE_MS = 400
const MIN_VISIBLE_PX = 48

export function loadMainWindowBounds(): MainWindowBounds {
  return parseMainWindowBounds(
    getSystemPropValues([...MAIN_WINDOW_BOUNDS_PROP_KEYS]),
  )
}

export function saveMainWindowBounds(bounds: MainWindowBounds): void {
  const serialized = serializeMainWindowBounds(bounds)
  for (const key of MAIN_WINDOW_BOUNDS_PROP_KEYS) {
    setSystemPropValue(key, serialized[key])
  }
}

export function readBoundsFromWindow(window: BrowserWindow): MainWindowBounds {
  const isMaximized = window.isMaximized()
  const rect = isMaximized ? window.getNormalBounds() : window.getBounds()
  const { width, height } = clampMainWindowSize(rect.width, rect.height)
  return {
    width,
    height,
    x: rect.x,
    y: rect.y,
    isMaximized,
  }
}

export function ensureBoundsOnScreen(bounds: MainWindowBounds): MainWindowBounds {
  const { width, height } = clampMainWindowSize(bounds.width, bounds.height)
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    return { width, height, x: Number.NaN, y: Number.NaN, isMaximized: bounds.isMaximized }
  }

  const candidate: Rectangle = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width,
    height,
  }

  const display = screen.getDisplayMatching(candidate)
  const area = display.workArea
  let x = candidate.x
  let y = candidate.y

  if (x + width < area.x + MIN_VISIBLE_PX) {
    x = area.x
  }
  if (y + height < area.y + MIN_VISIBLE_PX) {
    y = area.y
  }
  if (x > area.x + area.width - MIN_VISIBLE_PX) {
    x = Math.max(area.x, area.x + area.width - width)
  }
  if (y > area.y + area.height - MIN_VISIBLE_PX) {
    y = Math.max(area.y, area.y + area.height - height)
  }

  return {
    width,
    height,
    x,
    y,
    isMaximized: bounds.isMaximized,
  }
}

export function applyBoundsToWindow(
  window: BrowserWindow,
  bounds: MainWindowBounds,
): void {
  const restored = ensureBoundsOnScreen(bounds)
  if (Number.isFinite(restored.x) && Number.isFinite(restored.y)) {
    window.setBounds({
      x: restored.x,
      y: restored.y,
      width: restored.width,
      height: restored.height,
    })
  } else {
    window.setSize(restored.width, restored.height)
  }

  if (restored.isMaximized) {
    window.maximize()
  }
}

export function attachMainWindowStatePersistence(window: BrowserWindow): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const flushSave = () => {
    if (window.isDestroyed()) return
    saveMainWindowBounds(readBoundsFromWindow(window))
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      flushSave()
    }, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', flushSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', flushSave)
}
