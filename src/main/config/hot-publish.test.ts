import { describe, expect, it, vi } from 'vitest'

vi.mock('@config/index', () => ({
  default: {
    build: {
      hotPublishUrl: 'https://updates.example',
      hotPublishConfigName: 'update-config',
    },
  },
}))

import { hotPublishConfig } from './hot-publish'

describe('hotPublishConfig', () => {
  it('exposes url and configName from app config', () => {
    expect(hotPublishConfig).toEqual(
      expect.objectContaining({
        url: expect.any(String),
        configName: expect.any(String),
      }),
    )
    expect(hotPublishConfig.configName.length).toBeGreaterThan(0)
  })
})
