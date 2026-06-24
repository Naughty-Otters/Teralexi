export const APP_UI_APPEARANCE_KEY = 'app.ui.appearance'

export const APPEARANCE_SETTINGS_PROP_KEYS = [APP_UI_APPEARANCE_KEY] as const

export const APP_APPEARANCE_VALUES = ['solid', 'glass'] as const

export type AppAppearance = (typeof APP_APPEARANCE_VALUES)[number]

export const DEFAULT_APP_APPEARANCE: AppAppearance = 'solid'

export function parseAppAppearance(
  raw: string | undefined,
  fallback: AppAppearance = DEFAULT_APP_APPEARANCE,
): AppAppearance {
  const value = raw?.trim().toLowerCase()
  if (value === 'glass') return 'glass'
  if (value === 'solid') return 'solid'
  return fallback
}

export type AppearanceSettings = {
  appearance: AppAppearance
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  appearance: DEFAULT_APP_APPEARANCE,
}

export function parseAppearanceSettings(
  values: Record<string, string | undefined>,
): AppearanceSettings {
  return {
    appearance: parseAppAppearance(values[APP_UI_APPEARANCE_KEY]),
  }
}
