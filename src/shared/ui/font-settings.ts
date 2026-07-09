export const APP_FONT_FAMILY_KEY = 'app.ui.fontFamily'
export const APP_FONT_SIZE_KEY = 'app.ui.fontSize'

export const FONT_SETTINGS_PROP_KEYS = [
  APP_FONT_FAMILY_KEY,
  APP_FONT_SIZE_KEY,
] as const

export const DEFAULT_APP_FONT_FAMILY =
  "Menlo, Monaco, 'Courier New', monospace"

export const MIN_APP_FONT_SIZE = 11
export const MAX_APP_FONT_SIZE = 18

export type FontFamilyPresetId =
  | 'menlo'
  | 'sf-mono'
  | 'system-mono'
  | 'system-sans'

export type FontFamilyPreset = {
  id: FontFamilyPresetId
  value: string
}

export const FONT_FAMILY_PRESETS: readonly FontFamilyPreset[] = [
  {
    id: 'menlo',
    value: DEFAULT_APP_FONT_FAMILY,
  },
  {
    id: 'sf-mono',
    value: "'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  {
    id: 'system-mono',
    value:
      "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  {
    id: 'system-sans',
    value:
      'Helvetica Neue, Helvetica, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif',
  },
] as const

export type FontSettings = {
  fontFamily: string
  fontSize: number
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontFamily: DEFAULT_APP_FONT_FAMILY,
  fontSize: 14,
}

export function clampAppFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SETTINGS.fontSize
  return Math.min(
    MAX_APP_FONT_SIZE,
    Math.max(MIN_APP_FONT_SIZE, Math.round(value)),
  )
}

export function normalizeAppFontFamily(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_FONT_SETTINGS.fontFamily
  return trimmed
}

export function resolveFontFamilyPresetId(
  fontFamily: string,
): FontFamilyPresetId | 'custom' {
  const match = FONT_FAMILY_PRESETS.find((preset) => preset.value === fontFamily)
  return match?.id ?? 'custom'
}

/** Derived font-size tokens from `--app-font-size` (see app-font-scale.css). */
export function buildAppFontScaleStyleProperties(fontSize: number): Record<string, string> {
  const basePx = `${clampAppFontSize(fontSize)}px`
  return {
    '--app-font-size': basePx,
    '--app-font-size-xs': `calc(${basePx} * 10 / 13)`,
    '--app-font-size-sm': `calc(${basePx} * 11 / 13)`,
    '--app-font-size-secondary': `calc(${basePx} * 12 / 13)`,
    '--app-font-size-lg': `calc(${basePx} * 14 / 13)`,
  }
}

export function parseFontSettings(
  values: Record<string, string | undefined>,
): FontSettings {
  const rawSize = values[APP_FONT_SIZE_KEY]
  let fontSize = DEFAULT_FONT_SETTINGS.fontSize
  if (rawSize !== undefined && rawSize.trim() !== '') {
    const parsed = Number.parseInt(rawSize.trim(), 10)
    if (Number.isFinite(parsed)) {
      fontSize = clampAppFontSize(parsed)
    }
  }

  return {
    fontFamily: normalizeAppFontFamily(values[APP_FONT_FAMILY_KEY]),
    fontSize,
  }
}
