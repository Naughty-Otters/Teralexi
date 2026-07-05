import { describe, expect, it } from 'vitest'
import {
  inferSkillSystemPropertyDef,
  listMissingSkillSystemProperties,
  parseSkillSystemPropertyKeys,
  parseSkillSystemPropertySpecs,
  skillSystemPropertiesSatisfied,
} from './skill-system-properties'

const GOOGLE_PROPERTIES_MD = `
name: Google Workspace
system_properties: app.google.clientId, app.google.clientSecret
system_property.app.google.clientId.label: Google OAuth client ID
system_property.app.google.clientId.description: Desktop OAuth client ID from Google Cloud Console.
system_property.app.google.clientId.type: string
system_property.app.google.clientId.placeholder: ….apps.googleusercontent.com
system_property.app.google.clientSecret.label: Google OAuth client secret
system_property.app.google.clientSecret.description: Matching client secret from Google Cloud Console.
system_property.app.google.clientSecret.type: secret
system_property.app.google.clientSecret.placeholder: Client secret
`.trim()

describe('parseSkillSystemPropertyKeys', () => {
  it('parses comma-separated valid keys', () => {
    expect(
      parseSkillSystemPropertyKeys(
        'app.google.clientId, app.google.clientSecret',
      ),
    ).toEqual(['app.google.clientId', 'app.google.clientSecret'])
  })

  it('dedupes and skips invalid keys', () => {
    expect(
      parseSkillSystemPropertyKeys(
        'app.google.clientId, bad, app.google.clientId',
      ),
    ).toEqual(['app.google.clientId'])
  })
})

describe('parseSkillSystemPropertySpecs', () => {
  it('reads metadata lines from properties.md', () => {
    expect(parseSkillSystemPropertySpecs(GOOGLE_PROPERTIES_MD)).toEqual([
      {
        key: 'app.google.clientId',
        label: 'Google OAuth client ID',
        description:
          'Desktop OAuth client ID from Google Cloud Console.',
        type: 'string',
        placeholder: '….apps.googleusercontent.com',
      },
      {
        key: 'app.google.clientSecret',
        label: 'Google OAuth client secret',
        description: 'Matching client secret from Google Cloud Console.',
        type: 'secret',
        placeholder: 'Client secret',
      },
    ])
  })

  it('falls back to inferred labels when metadata lines are omitted', () => {
    const specs = parseSkillSystemPropertySpecs(
      'system_properties: settings.telegram.botToken',
    )
    expect(specs).toEqual([
      {
        key: 'settings.telegram.botToken',
        label: 'Bot Token',
        type: 'secret',
      },
    ])
  })
})

describe('inferSkillSystemPropertyDef', () => {
  it('derives label and secret type for unknown keys', () => {
    const def = inferSkillSystemPropertyDef('settings.telegram.botToken')
    expect(def.label).toBe('Bot Token')
    expect(def.type).toBe('secret')
  })
})

describe('skillSystemPropertiesSatisfied', () => {
  it('requires every declared key to be non-empty', () => {
    const keys = ['app.google.clientId', 'app.google.clientSecret']
    expect(
      skillSystemPropertiesSatisfied(keys, {
        'app.google.clientId': 'id',
        'app.google.clientSecret': '',
      }),
    ).toBe(false)
    expect(
      listMissingSkillSystemProperties(keys, {
        'app.google.clientId': 'id',
        'app.google.clientSecret': '',
      }),
    ).toEqual(['app.google.clientSecret'])
    expect(
      skillSystemPropertiesSatisfied(keys, {
        'app.google.clientId': 'id',
        'app.google.clientSecret': 'secret',
      }),
    ).toBe(true)
  })
})
