import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn(),
}))

import { getSystemPropValue } from '@config/system-prop'
import {
  getTeralexiBaseApiUrl,
  getTeralexiDesktopForceDevUpdateConfig,
  getTeralexiDesktopReleasesFeedUrl,
  getTeralexiGoogleAuthLoginUrl,
  getTeralexiGraphqlUrl,
  getTeralexiSupportUploadUrl,
} from './teralexi-platform-config'

describe('teralexi-platform-config', () => {
  beforeEach(() => {
    vi.mocked(getSystemPropValue).mockReset()
  })

  it('derives google auth from BASE_API when env-only override is unset', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.base.apiUrl') return 'https://staging.example.com/'
      return ''
    })

    expect(getTeralexiGoogleAuthLoginUrl()).toBe(
      'https://staging.example.com/auth/login',
    )
  })

  it('derives platform endpoints from BASE_API only', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.base.apiUrl') return 'http://127.0.0.1:8000'
      return ''
    })

    expect(getTeralexiBaseApiUrl()).toBe('http://127.0.0.1:8000')
    expect(getTeralexiGraphqlUrl()).toBe('http://127.0.0.1:8000/graphql')
    expect(getTeralexiGoogleAuthLoginUrl()).toBe(
      'http://127.0.0.1:8000/auth/login',
    )
    expect(getTeralexiSupportUploadUrl()).toBe(
      'http://127.0.0.1:8000/support/upload',
    )
    expect(getTeralexiDesktopReleasesFeedUrl()).toBe(
      'http://127.0.0.1:8000/desktop/releases/stable/',
    )
  })

  it('supports relative overrides under BASE_API', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.base.apiUrl') return 'http://127.0.0.1:8000'
      if (key === 'app.support.uploadUrl') return 'api/support/reports'
      return ''
    })

    expect(getTeralexiSupportUploadUrl()).toBe(
      'http://127.0.0.1:8000/api/support/reports',
    )
  })

  it('reads desktop force-dev update flag from system props', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.desktop.forceDevUpdateConfig') return 'true'
      return ''
    })
    expect(getTeralexiDesktopForceDevUpdateConfig()).toBe(true)
  })
})
