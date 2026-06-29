import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn(),
}))

import { getSystemPropValue } from '@config/system-prop'
import {
  getOpenFdeBaseApiUrl,
  getOpenFdeGoogleAuthLoginUrl,
  getOpenFdeGraphqlUrl,
  getOpenFdeSupportUploadUrl,
} from './openfde-platform-config'

describe('openfde-platform-config', () => {
  beforeEach(() => {
    vi.mocked(getSystemPropValue).mockReset()
  })

  it('derives platform endpoints from BASE_API only', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.base.apiUrl') return 'http://127.0.0.1:8000'
      return ''
    })

    expect(getOpenFdeBaseApiUrl()).toBe('http://127.0.0.1:8000')
    expect(getOpenFdeGraphqlUrl()).toBe('http://127.0.0.1:8000/graphql')
    expect(getOpenFdeGoogleAuthLoginUrl()).toBe(
      'http://127.0.0.1:8000/auth/login',
    )
    expect(getOpenFdeSupportUploadUrl()).toBe(
      'http://127.0.0.1:8000/support/upload',
    )
  })

  it('supports relative overrides under BASE_API', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.base.apiUrl') return 'http://127.0.0.1:8000'
      if (key === 'app.support.uploadUrl') return 'api/support/reports'
      return ''
    })

    expect(getOpenFdeSupportUploadUrl()).toBe(
      'http://127.0.0.1:8000/api/support/reports',
    )
  })
})
