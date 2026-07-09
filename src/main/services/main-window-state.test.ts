import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSystemPropValues, setSystemPropValue, getDisplayMatching } = vi.hoisted(
  () => ({
    getSystemPropValues: vi.fn(() => ({})),
    setSystemPropValue: vi.fn(),
    getDisplayMatching: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  }),
)

vi.mock('@config/system-prop', () => ({
  getSystemPropValues,
  setSystemPropValue,
}))

vi.mock('electron', () => ({
  screen: {
    getDisplayMatching,
  },
}))

import {
  MAIN_WINDOW_HEIGHT_KEY,
  MAIN_WINDOW_IS_MAXIMIZED_KEY,
  MAIN_WINDOW_WIDTH_KEY,
  MAIN_WINDOW_X_KEY,
  MAIN_WINDOW_Y_KEY,
} from '@shared/ui/main-window-state'
import {
  applyBoundsToWindow,
  attachMainWindowStatePersistence,
  ensureBoundsOnScreen,
  loadMainWindowBounds,
  readBoundsFromWindow,
  saveMainWindowBounds,
} from './main-window-state'

function makeWindow(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, () => void>()
  return {
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 100, y: 80, width: 1500, height: 900 })),
    getNormalBounds: vi.fn(() => ({ x: 120, y: 90, width: 1400, height: 850 })),
    setBounds: vi.fn(),
    setSize: vi.fn(),
    maximize: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      handlers.set(event, cb)
    }),
    trigger: (event: string) => handlers.get(event)?.(),
    ...overrides,
  }
}

describe('main-window-state service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads bounds from system properties', () => {
    getSystemPropValues.mockReturnValue({
      [MAIN_WINDOW_WIDTH_KEY]: '1500',
      [MAIN_WINDOW_HEIGHT_KEY]: '900',
      [MAIN_WINDOW_X_KEY]: '120',
      [MAIN_WINDOW_Y_KEY]: '80',
      [MAIN_WINDOW_IS_MAXIMIZED_KEY]: 'true',
    })

    expect(loadMainWindowBounds()).toEqual({
      width: 1500,
      height: 900,
      x: 120,
      y: 80,
      isMaximized: true,
    })
  })

  it('persists serialized bounds to system properties', () => {
    saveMainWindowBounds({
      width: 1500,
      height: 900,
      x: 120,
      y: 80,
      isMaximized: false,
    })

    expect(setSystemPropValue).toHaveBeenCalledWith(
      MAIN_WINDOW_WIDTH_KEY,
      '1500',
    )
    expect(setSystemPropValue).toHaveBeenCalledWith(
      MAIN_WINDOW_HEIGHT_KEY,
      '900',
    )
    expect(setSystemPropValue).toHaveBeenCalledWith(MAIN_WINDOW_X_KEY, '120')
    expect(setSystemPropValue).toHaveBeenCalledWith(MAIN_WINDOW_Y_KEY, '80')
    expect(setSystemPropValue).toHaveBeenCalledWith(
      MAIN_WINDOW_IS_MAXIMIZED_KEY,
      'false',
    )
  })

  it('reads normal bounds when window is maximized', () => {
    const window = makeWindow({ isMaximized: vi.fn(() => true) })
    expect(readBoundsFromWindow(window as never)).toEqual({
      width: 1400,
      height: 850,
      x: 120,
      y: 90,
      isMaximized: true,
    })
  })

  it('keeps NaN coordinates when position is unset', () => {
    expect(
      ensureBoundsOnScreen({
        width: 1500,
        height: 900,
        x: Number.NaN,
        y: Number.NaN,
        isMaximized: false,
      }),
    ).toEqual({
      width: 1500,
      height: 900,
      x: Number.NaN,
      y: Number.NaN,
      isMaximized: false,
    })
  })

  it('nudges off-screen windows back into the work area', () => {
    getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })

    expect(
      ensureBoundsOnScreen({
        width: 1500,
        height: 900,
        x: 2000,
        y: 1200,
        isMaximized: false,
      }),
    ).toEqual({
      width: 1500,
      height: 900,
      x: 420,
      y: 180,
      isMaximized: false,
    })
  })

  it('applies bounds and maximizes when requested', () => {
    const window = makeWindow()
    applyBoundsToWindow(window as never, {
      width: 1500,
      height: 900,
      x: 120,
      y: 80,
      isMaximized: true,
    })

    expect(window.setBounds).toHaveBeenCalledWith({
      x: 120,
      y: 80,
      width: 1500,
      height: 900,
    })
    expect(window.maximize).toHaveBeenCalled()
  })

  it('uses setSize when coordinates are unset', () => {
    const window = makeWindow()
    applyBoundsToWindow(window as never, {
      width: 1500,
      height: 900,
      x: Number.NaN,
      y: Number.NaN,
      isMaximized: false,
    })

    expect(window.setSize).toHaveBeenCalledWith(1500, 900)
    expect(window.setBounds).not.toHaveBeenCalled()
  })

  it('debounces persistence on resize and move', () => {
    const window = makeWindow()
    attachMainWindowStatePersistence(window as never)

    window.trigger('resize')
    expect(setSystemPropValue).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(setSystemPropValue).toHaveBeenCalled()
  })

  it('saves immediately on maximize and close', () => {
    const window = makeWindow()
    attachMainWindowStatePersistence(window as never)

    window.trigger('maximize')
    expect(setSystemPropValue).toHaveBeenCalled()

    setSystemPropValue.mockClear()
    window.trigger('close')
    expect(setSystemPropValue).toHaveBeenCalled()
  })
})
