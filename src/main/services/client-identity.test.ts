import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSystemPropValue, setSystemPropValue } = vi.hoisted(() => ({
  getSystemPropValue: vi.fn(),
  setSystemPropValue: vi.fn(),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue,
  setSystemPropValue,
}))

import {
  CLIENT_ID_PROP_KEY,
  ensureClientId,
  getClientId,
} from './client-identity'

describe('client-identity', () => {
  beforeEach(() => {
    getSystemPropValue.mockReset()
    setSystemPropValue.mockReset()
  })

  it('returns existing client id without regenerating', () => {
    getSystemPropValue.mockReturnValue('client-123')

    expect(ensureClientId()).toBe('client-123')
    expect(setSystemPropValue).not.toHaveBeenCalled()
  })

  it('generates and persists a client id on first launch', () => {
    getSystemPropValue.mockReturnValue('')

    const clientId = ensureClientId()

    expect(clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(setSystemPropValue).toHaveBeenCalledWith(
      CLIENT_ID_PROP_KEY,
      clientId,
    )
  })

  it('reads stored client id', () => {
    getSystemPropValue.mockReturnValue(' client-abc ')
    expect(getClientId()).toBe('client-abc')
  })
})
