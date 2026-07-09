import { describe, expect, it } from 'vitest'
import {
  APP_FONT_FAMILY_KEY,
  APP_FONT_SIZE_KEY,
  DEFAULT_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  buildAppFontScaleStyleProperties,
  clampAppFontSize,
  parseFontSettings,
  resolveFontFamilyPresetId,
} from './font-settings'

describe('font-settings', () => {
  it('defaults to Menlo / Monaco at 14px', () => {
    expect(DEFAULT_FONT_SETTINGS).toEqual({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
    })
  })

  it('parses stored font settings', () => {
    expect(
      parseFontSettings({
        [APP_FONT_FAMILY_KEY]: FONT_FAMILY_PRESETS[1]!.value,
        [APP_FONT_SIZE_KEY]: '15',
      }),
    ).toEqual({
      fontFamily: FONT_FAMILY_PRESETS[1]!.value,
      fontSize: 15,
    })
  })

  it('falls back when values are missing or invalid', () => {
    expect(parseFontSettings({})).toEqual(DEFAULT_FONT_SETTINGS)
    expect(
      parseFontSettings({
        [APP_FONT_FAMILY_KEY]: '   ',
        [APP_FONT_SIZE_KEY]: 'abc',
      }),
    ).toEqual(DEFAULT_FONT_SETTINGS)
  })

  it('clamps font size', () => {
    expect(clampAppFontSize(8)).toBe(11)
    expect(clampAppFontSize(24)).toBe(18)
  })

  it('resolves preset ids from stored font family values', () => {
    expect(resolveFontFamilyPresetId(DEFAULT_FONT_SETTINGS.fontFamily)).toBe(
      'menlo',
    )
    expect(resolveFontFamilyPresetId('Custom Font, monospace')).toBe('custom')
  })

  it('builds font scale CSS variables from base size', () => {
    expect(buildAppFontScaleStyleProperties(14)).toEqual({
      '--app-font-size': '14px',
      '--app-font-size-xs': 'calc(14px * 10 / 13)',
      '--app-font-size-sm': 'calc(14px * 11 / 13)',
      '--app-font-size-secondary': 'calc(14px * 12 / 13)',
      '--app-font-size-lg': 'calc(14px * 14 / 13)',
    })
  })
})
