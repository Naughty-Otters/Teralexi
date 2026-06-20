import { computed } from 'vue'
import { i18nt, globalLang, setLanguage, getSupportedLocales } from '@renderer/i18n'
import type { AppLocaleId } from '@renderer/i18n'

export function useI18n() {
  return {
    t: i18nt,
    p: computed(() => i18nt.value.settings.panels),
    locale: globalLang,
    setLocale: (id: AppLocaleId) => setLanguage(id),
    supportedLocales: getSupportedLocales(),
  }
}
