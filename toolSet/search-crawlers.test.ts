import { describe, expect, it, vi } from 'vitest'
import {
  CheerioCrawlerConfig,
  CheerioSearchHandler,
  launchSearchChromium,
  PlaywrightCrawlerConfig,
  PlaywrightSearchHandler,
  SearchCrawlerHandlerRegistry,
} from './search-crawlers'

describe('SearchCrawlerHandlerRegistry', () => {
  it('returns cheerio and playwright handlers by mode', () => {
    const registry = SearchCrawlerHandlerRegistry.createDefault()
    expect(registry.cheerio.mode).toBe('cheerio')
    expect(registry.playwright.mode).toBe('playwright')
    expect(registry.get('cheerio')).toBe(registry.cheerio)
    expect(registry.get('playwright')).toBe(registry.playwright)
  })
})

describe('Crawler config classes', () => {
  it('exposes shared defaults on CheerioCrawlerConfig', () => {
    const config = new CheerioCrawlerConfig()
    expect(config.timeoutSecs).toBe(25)
    expect(config.userAgent).toContain('Chrome')
  })

  it('exposes shared defaults on PlaywrightCrawlerConfig', () => {
    const config = new PlaywrightCrawlerConfig()
    expect(config.headless).toBe(true)
    expect(config.consentSelectors).toContain('L2AGLb')
  })

  it('constructs handler instances with config', () => {
    expect(new CheerioSearchHandler(new CheerioCrawlerConfig()).mode).toBe(
      'cheerio',
    )
    expect(
      new PlaywrightSearchHandler(new PlaywrightCrawlerConfig()).mode,
    ).toBe('playwright')
  })
})

describe('launchSearchChromium', () => {
  it('falls back to system Chrome when cloakbrowser and bundled Chromium fail', async () => {
    const cloakLaunch = vi.fn().mockRejectedValue(new Error('cloak unavailable'))
    vi.doMock('cloakbrowser', () => ({
      launch: cloakLaunch,
    }))

    const launch = vi.fn()
      .mockRejectedValueOnce(new Error('Executable does not exist'))
      .mockResolvedValueOnce({ close: vi.fn() })

    vi.doMock('playwright-core', () => ({
      chromium: { launch },
    }))

    vi.resetModules()
    const { launchSearchChromium: launchFn } = await import('./search-crawlers')
    const browser = await launchFn(new PlaywrightCrawlerConfig())
    await browser.close()

    expect(cloakLaunch).toHaveBeenCalledTimes(1)
    expect(launch).toHaveBeenCalledTimes(2)
    expect(launch.mock.calls[1]?.[0]).toMatchObject({ channel: 'chrome' })

    vi.doUnmock('cloakbrowser')
    vi.doUnmock('playwright-core')
    vi.resetModules()
  })
})
