import {
  APP_LOCALE_PROP_KEY,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  type AppLocaleId,
} from '@shared/i18n/locale-settings'
import { getSystemConfigValues, setSystemConfigValue } from '@store/agent/config'
import { globalLang, setLanguage } from './index'

export async function loadAppLocale(): Promise<AppLocaleId> {
  const values = await getSystemConfigValues([APP_LOCALE_PROP_KEY])
  const locale = normalizeAppLocale(
    values[APP_LOCALE_PROP_KEY],
    DEFAULT_APP_LOCALE,
  )
  setLanguage(locale)
  return locale
}

export async function saveAppLocale(locale: AppLocaleId): Promise<AppLocaleId> {
  const next = normalizeAppLocale(locale)
  await setSystemConfigValue(APP_LOCALE_PROP_KEY, next)
  setLanguage(next)
  return next
}

export function currentAppLocale(): AppLocaleId {
  return globalLang.value
}
