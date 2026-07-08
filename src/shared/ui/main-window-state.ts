export const MAIN_WINDOW_WIDTH_KEY = 'app.window.width'
export const MAIN_WINDOW_HEIGHT_KEY = 'app.window.height'
export const MAIN_WINDOW_X_KEY = 'app.window.x'
export const MAIN_WINDOW_Y_KEY = 'app.window.y'
export const MAIN_WINDOW_IS_MAXIMIZED_KEY = 'app.window.isMaximized'

export const MAIN_WINDOW_BOUNDS_PROP_KEYS = [
  MAIN_WINDOW_WIDTH_KEY,
  MAIN_WINDOW_HEIGHT_KEY,
  MAIN_WINDOW_X_KEY,
  MAIN_WINDOW_Y_KEY,
  MAIN_WINDOW_IS_MAXIMIZED_KEY,
] as const

export const DEFAULT_MAIN_WINDOW_WIDTH = 1700
export const DEFAULT_MAIN_WINDOW_HEIGHT = 800
export const MAIN_WINDOW_MIN_WIDTH = 1366
export const MAIN_WINDOW_MIN_HEIGHT = 600

export type MainWindowBounds = {
  width: number
  height: number
  x: number
  y: number
  isMaximized: boolean
}

export const DEFAULT_MAIN_WINDOW_BOUNDS: MainWindowBounds = {
  width: DEFAULT_MAIN_WINDOW_WIDTH,
  height: DEFAULT_MAIN_WINDOW_HEIGHT,
  x: Number.NaN,
  y: Number.NaN,
  isMaximized: false,
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function parseCoordinate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return Number.NaN
  const parsed = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function clampMainWindowSize(
  width: number,
  height: number,
): Pick<MainWindowBounds, 'width' | 'height'> {
  return {
    width: Math.max(
      MAIN_WINDOW_MIN_WIDTH,
      Number.isFinite(width) ? Math.round(width) : DEFAULT_MAIN_WINDOW_WIDTH,
    ),
    height: Math.max(
      MAIN_WINDOW_MIN_HEIGHT,
      Number.isFinite(height) ? Math.round(height) : DEFAULT_MAIN_WINDOW_HEIGHT,
    ),
  }
}

export function parseMainWindowBounds(
  values: Record<string, string | undefined>,
): MainWindowBounds {
  const width =
    parsePositiveInt(values[MAIN_WINDOW_WIDTH_KEY]) ??
    DEFAULT_MAIN_WINDOW_WIDTH
  const height =
    parsePositiveInt(values[MAIN_WINDOW_HEIGHT_KEY]) ??
    DEFAULT_MAIN_WINDOW_HEIGHT
  const { width: clampedWidth, height: clampedHeight } = clampMainWindowSize(
    width,
    height,
  )

  const isMaximizedRaw = values[MAIN_WINDOW_IS_MAXIMIZED_KEY]?.trim()
  const isMaximized = isMaximizedRaw === 'true' || isMaximizedRaw === '1'

  return {
    width: clampedWidth,
    height: clampedHeight,
    x: parseCoordinate(values[MAIN_WINDOW_X_KEY]),
    y: parseCoordinate(values[MAIN_WINDOW_Y_KEY]),
    isMaximized,
  }
}

export function serializeMainWindowBounds(
  bounds: MainWindowBounds,
): Record<(typeof MAIN_WINDOW_BOUNDS_PROP_KEYS)[number], string> {
  const { width, height } = clampMainWindowSize(bounds.width, bounds.height)
  return {
    [MAIN_WINDOW_WIDTH_KEY]: String(width),
    [MAIN_WINDOW_HEIGHT_KEY]: String(height),
    [MAIN_WINDOW_X_KEY]: Number.isFinite(bounds.x) ? String(Math.round(bounds.x)) : '',
    [MAIN_WINDOW_Y_KEY]: Number.isFinite(bounds.y) ? String(Math.round(bounds.y)) : '',
    [MAIN_WINDOW_IS_MAXIMIZED_KEY]: bounds.isMaximized ? 'true' : 'false',
  }
}
