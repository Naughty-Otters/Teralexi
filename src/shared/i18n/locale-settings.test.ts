import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_LOCALE,
  localeDisplayLabel,
  localeToResponseLanguage,
  normalizeAppLocale,
  resolveAgentResponseLanguage,
} from './locale-settings'

describe('locale-settings', () => {
  it('normalizes supported locales and falls back to default', () => {
    expect(normalizeAppLocale('zh-cn')).toBe('zh-cn')
    expect(normalizeAppLocale('  en  ')).toBe('en')
    expect(normalizeAppLocale('fr')).toBe(DEFAULT_APP_LOCALE)
    expect(normalizeAppLocale(undefined)).toBe(DEFAULT_APP_LOCALE)
  })

  it('normalizes whitespace-only string to default', () => {
    expect(normalizeAppLocale('   ')).toBe(DEFAULT_APP_LOCALE)
  })

  it('maps locale ids to LLM response language names', () => {
    expect(localeToResponseLanguage('en')).toBe('English')
    expect(localeToResponseLanguage('zh-cn')).toBe('Simplified Chinese')
  })

  it('prefers agent override over app locale', () => {
    expect(resolveAgentResponseLanguage('French', 'zh-cn')).toBe('French')
    expect(resolveAgentResponseLanguage(undefined, 'zh-cn')).toBe(
      'Simplified Chinese',
    )
    expect(resolveAgentResponseLanguage('   ', 'en')).toBe('English')
  })

  it('returns display label for valid locales', () => {
    expect(localeDisplayLabel('en')).toBe('English')
    expect(localeDisplayLabel('zh-cn')).toBe('简体中文')
  })

  it('returns locale id as-is if not found', () => {
    expect(localeDisplayLabel('fr' as any)).toBe('fr')
  })
})
