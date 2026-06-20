import { computed, ref } from 'vue'
import {
  APP_LOCALE_PROP_KEY,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  SUPPORTED_LOCALES,
  type AppLocaleId,
} from '@shared/i18n/locale-settings'
import type { AppLocaleBundle } from './types'
import { lang as enLabels } from './languages/en'

const localeModules = import.meta.glob('./languages/*.ts', { eager: true }) as Record<
  string,
  { lang: AppLocaleBundle }
>

function loadLanguageBundles(): Record<AppLocaleId, AppLocaleBundle> {
  const languages = {} as Record<AppLocaleId, AppLocaleBundle>

  for (const [key, module] of Object.entries(localeModules)) {
    if (key.endsWith('/index.ts')) continue
    const id = key.replace(/^\.\/languages\/|\.ts$/g, '') as AppLocaleId
    languages[id] = module.lang
  }

  if (!languages.en) {
    languages.en = enLabels
  }

  return languages
}

const bundles = loadLanguageBundles()

export const globalLang = ref<AppLocaleId>(DEFAULT_APP_LOCALE)

export const i18nt = computed(() => {
  return bundles[globalLang.value] ?? bundles.en
})

export function setLanguage(locale: string): void {
  globalLang.value = normalizeAppLocale(locale)
}

export function getSupportedLocales() {
  return SUPPORTED_LOCALES
}

export { APP_LOCALE_PROP_KEY, DEFAULT_APP_LOCALE }
export type { AppLocaleId, AppLocaleBundle }
