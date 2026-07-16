import { describe, expect, it } from 'vitest'
import {
  PUBLISH_WEBSITE_PLUGIN_ID,
  useWebsitePublishFlow,
  WebsitePublishDialog,
} from './index'

describe('website-publish extension public API', () => {
  it('exports plugin id, dialog, and flow helper', () => {
    expect(PUBLISH_WEBSITE_PLUGIN_ID).toBe('publish-website')
    expect(WebsitePublishDialog).toBeTruthy()
    expect(typeof useWebsitePublishFlow).toBe('function')
  })
})
