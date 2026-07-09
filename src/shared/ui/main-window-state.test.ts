import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAIN_WINDOW_BOUNDS,
  MAIN_WINDOW_HEIGHT_KEY,
  MAIN_WINDOW_IS_MAXIMIZED_KEY,
  MAIN_WINDOW_WIDTH_KEY,
  MAIN_WINDOW_X_KEY,
  MAIN_WINDOW_Y_KEY,
  clampMainWindowSize,
  parseMainWindowBounds,
  serializeMainWindowBounds,
} from './main-window-state'

describe('main-window-state', () => {
  it('uses defaults when values are missing', () => {
    expect(parseMainWindowBounds({})).toEqual(DEFAULT_MAIN_WINDOW_BOUNDS)
  })

  it('parses and serializes saved bounds', () => {
    const parsed = parseMainWindowBounds({
      [MAIN_WINDOW_WIDTH_KEY]: '1500',
      [MAIN_WINDOW_HEIGHT_KEY]: '900',
      [MAIN_WINDOW_X_KEY]: '120',
      [MAIN_WINDOW_Y_KEY]: '80',
      [MAIN_WINDOW_IS_MAXIMIZED_KEY]: 'true',
    })
    expect(parsed).toEqual({
      width: 1500,
      height: 900,
      x: 120,
      y: 80,
      isMaximized: true,
    })
    expect(serializeMainWindowBounds(parsed)).toEqual({
      [MAIN_WINDOW_WIDTH_KEY]: '1500',
      [MAIN_WINDOW_HEIGHT_KEY]: '900',
      [MAIN_WINDOW_X_KEY]: '120',
      [MAIN_WINDOW_Y_KEY]: '80',
      [MAIN_WINDOW_IS_MAXIMIZED_KEY]: 'true',
    })
  })

  it('clamps undersized dimensions', () => {
    expect(clampMainWindowSize(800, 400)).toEqual({
      width: 1366,
      height: 600,
    })
  })

  it('treats isMaximized value "1" as true', () => {
    expect(
      parseMainWindowBounds({
        [MAIN_WINDOW_IS_MAXIMIZED_KEY]: '1',
      }).isMaximized,
    ).toBe(true)
  })

  it('serializes unset coordinates as empty strings', () => {
    expect(
      serializeMainWindowBounds({
        width: 1500,
        height: 900,
        x: Number.NaN,
        y: Number.NaN,
        isMaximized: false,
      }),
    ).toMatchObject({
      [MAIN_WINDOW_X_KEY]: '',
      [MAIN_WINDOW_Y_KEY]: '',
    })
  })
})
