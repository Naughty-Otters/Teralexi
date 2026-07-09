// @vitest-environment happy-dom

import { describe, expect, it, afterEach } from 'vitest'
import { getActivePinia } from 'pinia'
import {
  createTestRouter,
  flushPromises,
  mountAppHarness,
  teardownAppHarness,
} from './mount-app'

describe('mount-app harness', () => {
  afterEach(() => {
    teardownAppHarness()
  })

  it('createTestRouter registers home and onboarding routes', () => {
    const router = createTestRouter()
    expect(router.getRoutes().map((route) => route.name)).toEqual([
      'home',
      'onboarding',
    ])
  })

  it('mountAppHarness wires pinia, router, and fake ipc', async () => {
    const customIpc = { emit: () => undefined } as never
    const harness = mountAppHarness({ ipc: customIpc })

    expect(getActivePinia()).toBe(harness.pinia)
    expect(harness.router.getRoutes().map((route) => route.path)).toEqual([
      '/',
      '/onboarding',
    ])
    expect(harness.ipc).toBe(customIpc)

    await harness.router.push('/onboarding')
    expect(harness.router.currentRoute.value.path).toBe('/onboarding')
  })

  it('mountAppHarness installs fake ipc when none is provided', () => {
    const harness = mountAppHarness()
    expect(harness.ipc.GetSystemConfigs).toBeDefined()
    expect(typeof harness.ipc.emit).toBe('function')
  })

  it('teardownAppHarness uninstalls fake ipc', () => {
    mountAppHarness()
    teardownAppHarness()
    expect(window.ipcRendererChannel).toBeUndefined()
  })

  it('flushPromises resolves pending microtasks', async () => {
    let resolved = false
    void Promise.resolve().then(() => {
      resolved = true
    })
    await flushPromises()
    expect(resolved).toBe(true)
  })
})
