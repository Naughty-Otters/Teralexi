import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_APPEARANCE,
  parseAppAppearance,
  parseAppearanceSettings,
} from './appearance-settings'

describe('appearance-settings', () => {
  it('parseAppAppearance accepts solid and glass', () => {
    expect(parseAppAppearance('solid')).toBe('solid')
    expect(parseAppAppearance('glass')).toBe('glass')
    expect(parseAppAppearance(' GLASS ')).toBe('glass')
  })

  it('parseAppAppearance falls back for unknown values', () => {
    expect(parseAppAppearance(undefined)).toBe(DEFAULT_APP_APPEARANCE)
    expect(parseAppAppearance('neon')).toBe(DEFAULT_APP_APPEARANCE)
  })

  it('parseAppearanceSettings reads app.ui.appearance', () => {
    expect(
      parseAppearanceSettings({ 'app.ui.appearance': 'glass' }),
    ).toEqual({ appearance: 'glass' })
    expect(parseAppearanceSettings({})).toEqual({
      appearance: DEFAULT_APP_APPEARANCE,
    })
  })
})
