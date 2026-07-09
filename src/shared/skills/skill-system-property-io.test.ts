import { describe, expect, it } from 'vitest'
import {
  expandSkillSystemPropertyFetchKeys,
  googleWorkspaceOAuthConfiguredFromSpecs,
  normalizeSkillSystemPropertyValues,
  skillSystemPropertiesConfigured,
} from './skill-system-property-io'
import type { SkillSystemPropertySpec } from './skill-system-properties'
import { GOOGLE_WORKSPACE_PROP_KEYS } from '@shared/google-workspace-settings'

const GOOGLE_SPECS: SkillSystemPropertySpec[] = [
  {
    key: 'app.google.clientId',
    label: 'Client ID',
    type: 'string',
  },
  {
    key: 'app.google.clientSecret',
    label: 'Client secret',
    type: 'secret',
  },
]

describe('skill-system-property-io', () => {
  it('fetch keys match declared skill property keys', () => {
    expect(expandSkillSystemPropertyFetchKeys(GOOGLE_SPECS)).toEqual([
      'app.google.clientId',
      'app.google.clientSecret',
    ])
  })

  it('normalize returns values for declared keys only', () => {
    expect(
      normalizeSkillSystemPropertyValues(GOOGLE_SPECS, {
        'app.google.clientId': ' my-id ',
        'app.google.clientSecret': 'my-secret',
        'app.other.key': 'ignored',
      }),
    ).toEqual({
      'app.google.clientId': 'my-id',
      'app.google.clientSecret': 'my-secret',
    })
  })

  it('normalize fills missing keys with empty strings', () => {
    expect(
      normalizeSkillSystemPropertyValues(GOOGLE_SPECS, {
        'app.google.clientId': 'id-only',
      }),
    ).toEqual({
      'app.google.clientId': 'id-only',
      'app.google.clientSecret': '',
    })
  })

  it('skillSystemPropertiesConfigured is true when all declared keys are set', () => {
    expect(
      skillSystemPropertiesConfigured(GOOGLE_SPECS, {
        'app.google.clientId': 'id',
        'app.google.clientSecret': 'secret',
      }),
    ).toBe(true)
  })

  it('skillSystemPropertiesConfigured is false when a declared key is missing', () => {
    expect(
      skillSystemPropertiesConfigured(GOOGLE_SPECS, {
        'app.google.clientId': 'id',
        'app.google.clientSecret': '',
      }),
    ).toBe(false)
  })

  it('skillSystemPropertiesConfigured is true for empty specs', () => {
    expect(skillSystemPropertiesConfigured([], {})).toBe(true)
  })

  it('googleWorkspaceOAuthConfiguredFromSpecs uses client id value', () => {
    expect(
      googleWorkspaceOAuthConfiguredFromSpecs(GOOGLE_SPECS, {
        [GOOGLE_WORKSPACE_PROP_KEYS.clientId]: 'my-client',
      }),
    ).toBe(true)
  })

  it('googleWorkspaceOAuthConfiguredFromSpecs falls back to map helper when client id is undeclared', () => {
    const specs: SkillSystemPropertySpec[] = [
      {
        key: 'app.other.key',
        label: 'Other',
        type: 'string',
      },
    ]
    expect(
      googleWorkspaceOAuthConfiguredFromSpecs(specs, {
        [GOOGLE_WORKSPACE_PROP_KEYS.clientId]: 'from-map',
      }),
    ).toBe(true)
  })

  it('googleWorkspaceOAuthConfiguredFromSpecs is false when client id is declared but empty', () => {
    expect(
      googleWorkspaceOAuthConfiguredFromSpecs(GOOGLE_SPECS, {
        [GOOGLE_WORKSPACE_PROP_KEYS.clientId]: '   ',
        [GOOGLE_WORKSPACE_PROP_KEYS.clientSecret]: 'secret',
      }),
    ).toBe(false)
  })
})
