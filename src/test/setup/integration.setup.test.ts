// @vitest-environment happy-dom

import { describe, expect, it, afterEach } from 'vitest'
import {
  integrationTestAfterEach,
  integrationTestBeforeEach,
} from './integration.setup'
import { ONBOARDING_COMPLETED_KEY } from '@renderer/store/modules/agent/config'

describe('integration.setup', () => {
  afterEach(() => {
    integrationTestAfterEach()
  })

  it('installs fake ipc and default invoke handlers', async () => {
    integrationTestBeforeEach()

    expect(window.ipcRendererChannel).toBeDefined()
    const configs = await window.ipcRendererChannel?.GetSystemConfigs?.invoke?.([
      ONBOARDING_COMPLETED_KEY,
    ])
    expect(configs?.[ONBOARDING_COMPLETED_KEY]).toBe('true')
  })

  it('cleans up fake ipc on teardown', () => {
    integrationTestBeforeEach()
    integrationTestAfterEach()
    expect(window.ipcRendererChannel).toBeUndefined()
  })
})
