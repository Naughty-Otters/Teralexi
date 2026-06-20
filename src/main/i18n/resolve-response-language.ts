import { getSystemPropValue } from '@config/system-prop'
import {
  APP_LOCALE_PROP_KEY,
  DEFAULT_APP_LOCALE,
  resolveAgentResponseLanguage,
} from '@shared/i18n/locale-settings'

export function resolveResponseLanguageForAgent(
  agentOverride?: string,
): string {
  const appLocale = getSystemPropValue(
    APP_LOCALE_PROP_KEY,
    DEFAULT_APP_LOCALE,
  )
  return resolveAgentResponseLanguage(agentOverride, appLocale)
}
