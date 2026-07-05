import { describe, expect, it } from 'vitest'
import {
  buildSkillSystemPropertiesInstructionsBlock,
  formatSkillSystemPropertyConfiguredStatus,
} from './skill-system-property-instructions'
import type { SkillSystemPropertySpec } from './skill-system-properties'

const GOOGLE_SPECS: SkillSystemPropertySpec[] = [
  {
    key: 'app.google.clientId',
    label: 'Google OAuth client ID',
    type: 'string',
    description: 'Desktop OAuth client ID from Google Cloud Console.',
  },
  {
    key: 'app.google.clientSecret',
    label: 'Google OAuth client secret',
    type: 'secret',
    description: 'Matching client secret from Google Cloud Console.',
  },
]

describe('formatSkillSystemPropertyConfiguredStatus', () => {
  it('reports missing values', () => {
    expect(
      formatSkillSystemPropertyConfiguredStatus(GOOGLE_SPECS[0], '  '),
    ).toBe('not configured')
  })

  it('shows string values when not secret', () => {
    expect(
      formatSkillSystemPropertyConfiguredStatus(
        GOOGLE_SPECS[0],
        '123.apps.googleusercontent.com',
      ),
    ).toBe('configured (123.apps.googleusercontent.com)')
  })

  it('hides secret values', () => {
    expect(
      formatSkillSystemPropertyConfiguredStatus(
        GOOGLE_SPECS[1],
        'super-secret',
      ),
    ).toBe('configured (value hidden)')
  })
})

describe('buildSkillSystemPropertiesInstructionsBlock', () => {
  it('lists declared keys with labels and configured status', () => {
    const block = buildSkillSystemPropertiesInstructionsBlock(GOOGLE_SPECS, {
      'app.google.clientId': '123.apps.googleusercontent.com',
      'app.google.clientSecret': 'secret',
    })
    expect(block).toContain('### Skill configuration properties')
    expect(block).toContain('`app.google.clientId`')
    expect(block).toContain('configured (123.apps.googleusercontent.com)')
    expect(block).toContain('`app.google.clientSecret`')
    expect(block).toContain('configured (value hidden)')
    expect(block).toContain('Desktop OAuth client ID from Google Cloud Console.')
  })

  it('returns empty string when no specs', () => {
    expect(buildSkillSystemPropertiesInstructionsBlock([], {})).toBe('')
  })
})
