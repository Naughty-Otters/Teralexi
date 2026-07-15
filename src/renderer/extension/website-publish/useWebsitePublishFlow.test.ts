import { describe, expect, it, vi } from 'vitest'
import { PUBLISH_WEBSITE_PLUGIN_ID } from './constants'
import { useWebsitePublishFlow } from './useWebsitePublishFlow'

describe('useWebsitePublishFlow', () => {
  it('ignores non-publish toolbar plugins', async () => {
    const preview = vi.fn()
    const invoke = vi.fn()
    const flow = useWebsitePublishFlow({ preview, invoke })

    const handled = await flow.handleToolbarClick({
      id: 'other-plugin',
      label: 'Other',
      enabled: true,
    })

    expect(handled).toBe(false)
    expect(preview).not.toHaveBeenCalled()
    expect(flow.open.value).toBe(false)
  })

  it('opens confirm dialog on successful preview', async () => {
    const preview = vi.fn().mockResolvedValue({
      ok: true,
      title: 'Publish website',
      siteDir: '/tmp/site',
    })
    const flow = useWebsitePublishFlow({
      preview,
      invoke: vi.fn(),
    })

    const handled = await flow.handleToolbarClick({
      id: PUBLISH_WEBSITE_PLUGIN_ID,
      label: 'Publish website',
      enabled: true,
    })

    expect(handled).toBe(true)
    expect(preview).toHaveBeenCalledWith(PUBLISH_WEBSITE_PLUGIN_ID)
    expect(flow.open.value).toBe(true)
    expect(flow.phase.value).toBe('confirm')
    expect(flow.preview.value?.siteDir).toBe('/tmp/site')
    expect(flow.result.value).toBeNull()
  })

  it('opens result phase when preview fails', async () => {
    const preview = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Sign in required',
    })
    const flow = useWebsitePublishFlow({
      preview,
      invoke: vi.fn(),
    })

    await flow.handleToolbarClick({
      id: PUBLISH_WEBSITE_PLUGIN_ID,
      label: 'Publish website',
      enabled: false,
      disabledReason: 'Sign in required',
    })

    expect(flow.open.value).toBe(true)
    expect(flow.phase.value).toBe('result')
    expect(flow.result.value).toEqual({
      ok: false,
      error: 'Sign in required',
    })
  })

  it('invokes publish and stores the result', async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      absoluteUrl: 'https://example.test/site/',
    })
    const flow = useWebsitePublishFlow({
      preview: vi.fn().mockResolvedValue({ ok: true, title: 'Publish website' }),
      invoke,
    })

    await flow.handleToolbarClick({
      id: PUBLISH_WEBSITE_PLUGIN_ID,
      label: 'Publish website',
      enabled: true,
    })
    await flow.confirmPublish()

    expect(invoke).toHaveBeenCalledWith(PUBLISH_WEBSITE_PLUGIN_ID)
    expect(flow.phase.value).toBe('result')
    expect(flow.result.value?.absoluteUrl).toBe('https://example.test/site/')
  })

  it('stores invoke errors in the result phase', async () => {
    const flow = useWebsitePublishFlow({
      preview: vi.fn().mockResolvedValue({ ok: true }),
      invoke: vi.fn().mockRejectedValue(new Error('network down')),
    })

    await flow.handleToolbarClick({
      id: PUBLISH_WEBSITE_PLUGIN_ID,
      label: 'Publish website',
      enabled: true,
    })
    await flow.confirmPublish()

    expect(flow.phase.value).toBe('result')
    expect(flow.result.value).toEqual({
      ok: false,
      error: 'network down',
    })
  })

  it('blocks close while publishing', async () => {
    let resolveInvoke: ((value: { ok: boolean }) => void) | undefined
    const invoke = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveInvoke = resolve
        }),
    )
    const flow = useWebsitePublishFlow({
      preview: vi.fn().mockResolvedValue({ ok: true }),
      invoke,
    })

    await flow.handleToolbarClick({
      id: PUBLISH_WEBSITE_PLUGIN_ID,
      label: 'Publish website',
      enabled: true,
    })
    const pending = flow.confirmPublish()
    expect(flow.phase.value).toBe('publishing')

    flow.close()
    expect(flow.open.value).toBe(true)

    resolveInvoke?.({ ok: true })
    await pending
    flow.close()
    expect(flow.open.value).toBe(false)
    expect(flow.phase.value).toBe('confirm')
  })
})
