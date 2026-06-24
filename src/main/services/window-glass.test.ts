import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  applyWindowGlassEffect,
  glassBrowserWindowOptions,
  isMacGlassSupported,
} from './window-glass'

describe('window-glass', () => {
  const platform = process.platform

  beforeEach(() => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
  })

  afterEach(() => {
    vi.stubGlobal('process', { ...process, platform })
  })

  it('isMacGlassSupported is true on darwin', () => {
    expect(isMacGlassSupported()).toBe(true)
  })

  it('glassBrowserWindowOptions returns vibrancy on macOS glass', () => {
    expect(glassBrowserWindowOptions('glass')).toMatchObject({
      transparent: true,
      vibrancy: 'under-window',
      backgroundColor: '#00000000',
    })
    expect(glassBrowserWindowOptions('solid')).toEqual({})
  })

  it('applyWindowGlassEffect toggles vibrancy', () => {
    const win = {
      isDestroyed: () => false,
      setVibrancy: vi.fn(),
      setBackgroundColor: vi.fn(),
    }
    applyWindowGlassEffect(win as never, 'glass')
    expect(win.setVibrancy).toHaveBeenCalledWith('under-window')
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#00000000')

    applyWindowGlassEffect(win as never, 'solid')
    expect(win.setVibrancy).toHaveBeenCalledWith(null)
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#ffffff')
  })
})
