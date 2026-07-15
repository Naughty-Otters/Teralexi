/**
 * UI integration: ReportPanel + the same tab helpers ChatPanel uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ReportPanel from './components/ReportPanel.vue'
import {
  closePreviewLinkTab,
  createEmptyPreviewLinkTab,
  openPreviewLinkTab,
  updatePreviewLinkTabUrl,
  type PreviewLinkTab,
} from './report-preview-tabs'
import type { ReportPanelPreviewSource } from './components/ReportPanel.vue'

const syncInvoke = vi.fn(async () => undefined)

function installPreviewIpc() {
  ;(window as Window & { ipcRendererChannel?: unknown }).ipcRendererChannel = {
    SyncSandboxOutputView: { invoke: syncInvoke },
    NavigateSandboxOutputView: {
      invoke: vi.fn(async () => ({
        ok: true,
        canGoBack: false,
        canGoForward: false,
        url: '',
      })),
    },
    SandboxOutputViewNavigationChanged: {
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  }
}

const PreviewHarness = defineComponent({
  components: { ReportPanel },
  setup() {
    const linkTabs = ref<PreviewLinkTab[]>([])
    const activeLinkTabId = ref<string | null>(null)
    const previewSource = ref<ReportPanelPreviewSource>('sandbox-run')
    const sandboxRuns = [
      {
        id: 'run-1',
        label: 'Run 1',
        resultsFileUrl: 'file:///tmp/sandbox/output/results',
      },
    ]

    function onAddLinkTab() {
      const next = createEmptyPreviewLinkTab(linkTabs.value)
      linkTabs.value = next.tabs
      activeLinkTabId.value = next.activeTabId
      previewSource.value = 'link'
    }

    function onUpdateLinkTabUrl(payload: { tabId: string; url: string }) {
      linkTabs.value = updatePreviewLinkTabUrl(
        linkTabs.value,
        payload.tabId,
        payload.url,
      )
    }

    function onOpenPreviewUrl(url: string) {
      const next = openPreviewLinkTab(linkTabs.value, url)
      linkTabs.value = next.tabs
      activeLinkTabId.value = next.activeTabId
      previewSource.value = 'link'
    }

    function onCloseLinkTab(tabId: string) {
      const next = closePreviewLinkTab(
        linkTabs.value,
        activeLinkTabId.value,
        tabId,
      )
      linkTabs.value = next.tabs
      activeLinkTabId.value = next.activeTabId
      if (next.tabs.length === 0) previewSource.value = 'sandbox-run'
    }

    return {
      linkTabs,
      activeLinkTabId,
      previewSource,
      sandboxRuns,
      onAddLinkTab,
      onUpdateLinkTabUrl,
      onOpenPreviewUrl,
      onCloseLinkTab,
    }
  },
  template: `
    <ReportPanel
      :sandbox-runs="sandboxRuns"
      selected-run-id="run-1"
      :link-tabs="linkTabs"
      :active-link-tab-id="activeLinkTabId"
      :preview-source="previewSource"
      @update:selected-run-id="() => {}"
      @update:active-link-tab-id="(id) => (activeLinkTabId = id)"
      @update:preview-source="(source) => (previewSource = source)"
      @add-link-tab="onAddLinkTab"
      @update-link-tab-url="onUpdateLinkTabUrl"
      @open-preview-url="onOpenPreviewUrl"
      @close-link-tab="onCloseLinkTab"
    />
  `,
})

function mountHarness(): VueWrapper {
  return mount(PreviewHarness, {
    global: {
      stubs: {
        UIcon: { template: '<span class="uicon" />' },
      },
    },
  })
}

beforeEach(() => {
  syncInvoke.mockClear()
  installPreviewIpc()
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  document.body.innerHTML = ''
  delete (window as Window & { ipcRendererChannel?: unknown }).ipcRendererChannel
})

describe('report preview tabs (UI integration)', () => {
  it('adds an empty tab from +, keeps URL isolated while typing, then commits https', async () => {
    const wrapper = mountHarness()
    await flushPromises()

    expect(
      wrapper.get('input.report-panel-url-input').element.value,
    ).toBe('file:///tmp/sandbox/output/results')

    await wrapper.get('button.cp-tab--add').trigger('click')
    await nextTick()
    await flushPromises()

    const panel = wrapper.getComponent(ReportPanel)
    expect(panel.props('previewSource')).toBe('link')
    expect(panel.props('linkTabs')).toHaveLength(1)
    expect((panel.props('linkTabs') as PreviewLinkTab[])[0]?.url).toBe('')
    expect(wrapper.get('input.report-panel-url-input').element.value).toBe('')
    expect(wrapper.find('.report-panel-placeholder').exists()).toBe(true)

    syncInvoke.mockClear()
    const input = wrapper.get('input.report-panel-url-input')
    await input.setValue('www.google.com')
    await nextTick()
    await flushPromises()

    // Typing must not commit / navigate yet.
    expect((panel.props('linkTabs') as PreviewLinkTab[])[0]?.url).toBe('')
    const liveFileUrls = syncInvoke.mock.calls.map(
      (call) => (call[0] as { fileUrl?: string | null } | undefined)?.fileUrl,
    )
    expect(
      liveFileUrls.every((url) => url == null || url === ''),
    ).toBe(true)

    await input.trigger('keydown.enter')
    await nextTick()
    await flushPromises()

    const committed = (panel.props('linkTabs') as PreviewLinkTab[])[0]
    expect(committed?.url).toBe('https://www.google.com/')
    expect(committed?.label).toContain('google.com')
    expect(wrapper.get('input.report-panel-url-input').element.value).toBe(
      'https://www.google.com/',
    )
    expect(wrapper.find('.report-panel-placeholder').exists()).toBe(false)

    const committedUrls = syncInvoke.mock.calls
      .map(
        (call) => (call[0] as { fileUrl?: string | null } | undefined)?.fileUrl,
      )
      .filter(Boolean)
    expect(committedUrls).toContain('https://www.google.com/')

    wrapper.unmount()
  })

  it('can open multiple empty tabs and close back to the sandbox run', async () => {
    const wrapper = mountHarness()
    await wrapper.get('button.cp-tab--add').trigger('click')
    await wrapper.get('button.cp-tab--add').trigger('click')
    await nextTick()

    const panel = wrapper.getComponent(ReportPanel)
    expect(panel.props('linkTabs')).toHaveLength(2)
    expect(
      (panel.props('linkTabs') as PreviewLinkTab[]).every((t) => t.url === ''),
    ).toBe(true)

    const closeButtons = wrapper.findAll('button.cp-tab__close')
    expect(closeButtons).toHaveLength(2)
    await closeButtons[1]!.trigger('click')
    await closeButtons[0]!.trigger('click')
    await nextTick()

    expect(panel.props('linkTabs')).toHaveLength(0)
    expect(panel.props('previewSource')).toBe('sandbox-run')
    expect(wrapper.get('input.report-panel-url-input').element.value).toBe(
      'file:///tmp/sandbox/output/results',
    )
    wrapper.unmount()
  })

  it('opens a normalized https link tab from sandbox address-bar navigation', async () => {
    const wrapper = mountHarness()
    const input = wrapper.get('input.report-panel-url-input')
    await input.setValue('example.com/docs')
    await input.trigger('keydown.enter')
    await nextTick()
    await flushPromises()

    const panel = wrapper.getComponent(ReportPanel)
    expect(panel.props('previewSource')).toBe('link')
    expect((panel.props('linkTabs') as PreviewLinkTab[])[0]?.url).toBe(
      'https://example.com/docs',
    )
    expect(wrapper.get('input.report-panel-url-input').element.value).toBe(
      'https://example.com/docs',
    )
    wrapper.unmount()
  })
})
