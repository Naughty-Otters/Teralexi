export const APP_LOCALE_PROP_KEY = 'app.ui.locale'

export const DEFAULT_APP_LOCALE = 'en'

export type AppLocaleId = 'en' | 'zh-cn'

export type SupportedLocale = {
  id: AppLocaleId
  /** Native label shown in the language picker. */
  label: string
  /** LLM response-language name injected into agent instructions. */
  responseLanguage: string
}

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  { id: 'en', label: 'English', responseLanguage: 'English' },
  { id: 'zh-cn', label: '简体中文', responseLanguage: 'Simplified Chinese' },
] as const

const LOCALE_BY_ID = new Map<AppLocaleId, SupportedLocale>(
  SUPPORTED_LOCALES.map((entry) => [entry.id, entry]),
)

export function isSupportedAppLocale(value: string): value is AppLocaleId {
  return LOCALE_BY_ID.has(value as AppLocaleId)
}

export function normalizeAppLocale(
  value: string | undefined,
  fallback: AppLocaleId = DEFAULT_APP_LOCALE,
): AppLocaleId {
  const trimmed = value?.trim()
  if (trimmed && isSupportedAppLocale(trimmed)) return trimmed
  return fallback
}

export function localeToResponseLanguage(locale: AppLocaleId): string {
  return LOCALE_BY_ID.get(locale)?.responseLanguage ?? 'English'
}

export function localeDisplayLabel(locale: AppLocaleId): string {
  return LOCALE_BY_ID.get(locale)?.label ?? locale
}

/** Agent override wins; otherwise derive from the app UI locale setting. */
export function resolveAgentResponseLanguage(
  agentOverride: string | undefined,
  appLocale: string | undefined,
): string {
  const trimmed = agentOverride?.trim()
  if (trimmed) return trimmed
  return localeToResponseLanguage(normalizeAppLocale(appLocale))
}
