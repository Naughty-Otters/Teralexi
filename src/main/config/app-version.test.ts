import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '38.8.6'),
  },
}))

vi.mock('../../../package.json', () => ({
  version: '0.0.1',
}))

import { app } from 'electron'
import { resolveAppVersion } from './app-version'

describe('resolveAppVersion', () => {
  it('uses package.json when unpackaged', () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    expect(resolveAppVersion()).toBe('0.0.1')
  })

  it('uses app.getVersion when packaged', () => {
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
    expect(resolveAppVersion()).toBe('38.8.6')
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
  })
})
