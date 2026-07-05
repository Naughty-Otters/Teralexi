import { describe, expect, it } from 'vitest'
import {
  expandSkillSystemPropertyFetchKeys,
  normalizeSkillSystemPropertyValues,
} from './skill-system-property-io'
import type { SkillSystemPropertySpec } from './skill-system-properties'

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
})
