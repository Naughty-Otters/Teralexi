import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import type { AppAppearance } from '@shared/ui/appearance-settings'

const MAC_GLASS_VIBRANCY = 'under-window' as const

export function isMacGlassSupported(): boolean {
  return process.platform === 'darwin'
}

/** Extra BrowserWindow options when macOS glass mode is enabled at creation. */
export function glassBrowserWindowOptions(
  appearance: AppAppearance,
): BrowserWindowConstructorOptions {
  if (appearance !== 'glass' || !isMacGlassSupported()) {
    return {}
  }
  return {
    transparent: true,
    vibrancy: MAC_GLASS_VIBRANCY,
    visualEffectState: 'active',
    backgroundColor: '#00000000',
  }
}

/** Toggle native macOS vibrancy on an existing window (no-op on other platforms). */
export function applyWindowGlassEffect(
  win: BrowserWindow,
  appearance: AppAppearance,
): void {
  if (!isMacGlassSupported() || win.isDestroyed()) return

  if (appearance === 'glass') {
    win.setVibrancy(MAC_GLASS_VIBRANCY)
    win.setBackgroundColor('#00000000')
    return
  }

  win.setVibrancy(null)
  win.setBackgroundColor('#ffffff')
}
