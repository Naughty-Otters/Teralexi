import { ref } from 'vue'
import {
  APP_FONT_FAMILY_KEY,
  APP_FONT_SIZE_KEY,
  DEFAULT_FONT_SETTINGS,
  FONT_SETTINGS_PROP_KEYS,
  clampAppFontSize,
  normalizeAppFontFamily,
  parseFontSettings,
  type FontSettings,
} from '@shared/ui/font-settings'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'

export const appFontFamily = ref(DEFAULT_FONT_SETTINGS.fontFamily)
export const appFontSize = ref(DEFAULT_FONT_SETTINGS.fontSize)

export function applyFontSettings(settings: FontSettings): void {
  const fontFamily = normalizeAppFontFamily(settings.fontFamily)
  const fontSize = clampAppFontSize(settings.fontSize)

  appFontFamily.value = fontFamily
  appFontSize.value = fontSize

  const root = document.documentElement
  root.style.setProperty('--app-font-family', fontFamily)
  root.style.setProperty('--app-font-size', `${fontSize}px`)
}

export async function loadFontSettings(): Promise<FontSettings> {
  const values = await getSystemConfigValues([...FONT_SETTINGS_PROP_KEYS])
  const parsed = parseFontSettings(values)
  applyFontSettings(parsed)
  return parsed
}

export async function saveFontSettings(
  settings: FontSettings,
): Promise<FontSettings> {
  const next: FontSettings = {
    fontFamily: normalizeAppFontFamily(settings.fontFamily),
    fontSize: clampAppFontSize(settings.fontSize),
  }

  await Promise.all([
    setSystemConfigValue(APP_FONT_FAMILY_KEY, next.fontFamily),
    setSystemConfigValue(APP_FONT_SIZE_KEY, String(next.fontSize)),
  ])

  applyFontSettings(next)
  return next
}
