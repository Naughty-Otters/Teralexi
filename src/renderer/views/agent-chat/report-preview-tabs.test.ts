import { describe, expect, it } from 'vitest'
import {
  closePreviewLinkTab,
  createEmptyPreviewLinkTab,
  ensurePreviewUrlScheme,
  labelForPreviewUrl,
  normalizePreviewTabUrl,
  openPreviewLinkTab,
  updatePreviewLinkTabUrl,
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

  it('uses Preview for empty URLs', () => {
    expect(labelForPreviewUrl('')).toBe('Preview')
  })
})

describe('ensurePreviewUrlScheme', () => {
  it('prefixes bare hostnames with https://', () => {
    expect(ensurePreviewUrlScheme('www.google.com')).toBe(
      'https://www.google.com',
    )
    expect(ensurePreviewUrlScheme('example.com/path')).toBe(
      'https://example.com/path',
    )
  })

  it('leaves explicit schemes and local paths unchanged', () => {
    expect(ensurePreviewUrlScheme('http://example.com')).toBe(
      'http://example.com',
    )
    expect(ensurePreviewUrlScheme('https://example.com')).toBe(
      'https://example.com',
    )
    expect(ensurePreviewUrlScheme('file:///tmp/a.html')).toBe(
      'file:///tmp/a.html',
    )
    expect(ensurePreviewUrlScheme('/tmp/a.html')).toBe('/tmp/a.html')
    expect(ensurePreviewUrlScheme('C:\\Users\\a\\b.html')).toBe(
      'C:\\Users\\a\\b.html',
    )
  })

  it('returns empty for blank input', () => {
    expect(ensurePreviewUrlScheme('')).toBe('')
    expect(ensurePreviewUrlScheme('   ')).toBe('')
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

  it('defaults bare hostnames to https when opening', () => {
    const opened = openPreviewLinkTab([], 'www.example.com/docs')
    expect(opened.tabs[0]?.url).toBe('https://www.example.com/docs')
    expect(opened.tabs[0]?.label).toContain('example.com')
  })
})

describe('createEmptyPreviewLinkTab', () => {
  it('adds a blank tab with a unique id each time', () => {
    const first = createEmptyPreviewLinkTab([])
    expect(first.tabs).toHaveLength(1)
    expect(first.tabs[0]).toMatchObject({ url: '', label: 'New tab' })
    expect(first.activeTabId).toBe(first.tabs[0]?.id)

    const second = createEmptyPreviewLinkTab(first.tabs)
    expect(second.tabs).toHaveLength(2)
    expect(second.tabs[1]?.id).not.toBe(first.tabs[0]?.id)
    expect(second.activeTabId).toBe(second.tabs[1]?.id)
  })

  it('does not dedupe blank tabs against each other', () => {
    const first = createEmptyPreviewLinkTab([])
    const second = createEmptyPreviewLinkTab(first.tabs)
    const third = createEmptyPreviewLinkTab(second.tabs)
    expect(third.tabs.map((t) => t.url)).toEqual(['', '', ''])
    expect(new Set(third.tabs.map((t) => t.id)).size).toBe(3)
  })
})

describe('normalizePreviewTabUrl', () => {
  it('normalizes http URLs', () => {
    expect(normalizePreviewTabUrl('https://example.com/x')).toBe(
      'https://example.com/x',
    )
  })

  it('defaults bare hostnames to https', () => {
    expect(normalizePreviewTabUrl('www.google.com')).toBe(
      'https://www.google.com/',
    )
    expect(normalizePreviewTabUrl('example.com/docs')).toBe(
      'https://example.com/docs',
    )
  })

  it('preserves explicit schemes and local file paths', () => {
    expect(normalizePreviewTabUrl('http://example.com/x')).toBe(
      'http://example.com/x',
    )
    expect(normalizePreviewTabUrl('file:///tmp/report.html')).toBe(
      'file:///tmp/report.html',
    )
    expect(normalizePreviewTabUrl('/tmp/report.html')).toBe('/tmp/report.html')
  })
})

describe('updatePreviewLinkTabUrl', () => {
  it('updates url and label for the matching tab', () => {
    const empty = createEmptyPreviewLinkTab([])
    const next = updatePreviewLinkTabUrl(
      empty.tabs,
      empty.activeTabId,
      'https://example.com/docs',
    )
    expect(next[0]).toMatchObject({
      id: empty.activeTabId,
      url: 'https://example.com/docs',
      label: 'docs · example.com',
    })
  })

  it('defaults bare hostnames to https when updating', () => {
    const empty = createEmptyPreviewLinkTab([])
    const next = updatePreviewLinkTabUrl(
      empty.tabs,
      empty.activeTabId,
      'www.google.com',
    )
    expect(next[0]?.url).toBe('https://www.google.com/')
  })

  it('resets label to New tab when clearing the url', () => {
    const opened = openPreviewLinkTab([], 'https://example.com')
    const cleared = updatePreviewLinkTabUrl(
      opened.tabs,
      opened.activeTabId,
      '',
    )
    expect(cleared[0]).toMatchObject({ url: '', label: 'New tab' })
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

  it('returns null active id when the last empty tab is closed', () => {
    const empty = createEmptyPreviewLinkTab([])
    const closed = closePreviewLinkTab(
      empty.tabs,
      empty.activeTabId,
      empty.activeTabId,
    )
    expect(closed).toEqual({ tabs: [], activeTabId: null })
  })
})
