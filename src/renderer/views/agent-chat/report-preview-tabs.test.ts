import { describe, expect, it } from 'vitest'
import {
  closePreviewLinkTab,
  labelForPreviewUrl,
  normalizePreviewTabUrl,
  openPreviewLinkTab,
} from './report-preview-tabs'

describe('labelForPreviewUrl', () => {
  it('uses the file name for file URLs', () => {
    expect(
      labelForPreviewUrl('file:///tmp/sandbox/output/results/report.html'),
    ).toBe('report.html')
  })

  it('uses host and path basename for http URLs', () => {
    expect(labelForPreviewUrl('https://docs.example.com/api/reference')).toBe(
      'reference · docs.example.com',
    )
  })
})

describe('openPreviewLinkTab', () => {
  it('adds a new tab and activates it', () => {
    const first = openPreviewLinkTab([], 'https://example.com/a')
    expect(first.tabs).toHaveLength(1)
    expect(first.activeTabId).toBe(first.tabs[0]?.id)

    const second = openPreviewLinkTab(first.tabs, 'https://example.com/b')
    expect(second.tabs).toHaveLength(2)
    expect(second.activeTabId).toBe(second.tabs[1]?.id)
  })

  it('activates an existing tab instead of duplicating', () => {
    const first = openPreviewLinkTab([], 'https://example.com/a')
    const second = openPreviewLinkTab(first.tabs, 'https://example.com/b')
    const again = openPreviewLinkTab(second.tabs, 'https://example.com/a')
    expect(again.tabs).toHaveLength(2)
    expect(again.activeTabId).toBe(first.tabs[0]?.id)
  })

  it('dedupes file URLs with equivalent paths', () => {
    const first = openPreviewLinkTab([], 'file:///tmp/report.html')
    const second = openPreviewLinkTab(
      first.tabs,
      'file://%2Ftmp%2Freport.html',
    )
    expect(second.tabs).toHaveLength(1)
    expect(second.activeTabId).toBe(first.tabs[0]?.id)
  })
})

describe('closePreviewLinkTab', () => {
  it('selects a neighbor when the active tab is closed', () => {
    const opened = openPreviewLinkTab(
      openPreviewLinkTab([], 'https://a.test').tabs,
      'https://b.test',
    )
    const closed = closePreviewLinkTab(
      opened.tabs,
      opened.activeTabId,
      opened.activeTabId,
    )
    expect(closed.tabs).toHaveLength(1)
    expect(closed.activeTabId).toBe(opened.tabs[0]?.id)
  })
})

describe('normalizePreviewTabUrl', () => {
  it('normalizes http URLs', () => {
    expect(normalizePreviewTabUrl('https://example.com/x')).toBe(
      'https://example.com/x',
    )
  })
})
