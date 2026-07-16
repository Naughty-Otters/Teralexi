/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReportPanel from './ReportPanel.vue'
import type { PreviewLinkTab } from '../report-preview-tabs'

const syncInvoke = vi.fn(async () => undefined)
const navigateInvoke = vi.fn(async () => ({
  ok: true,
  canGoBack: false,
  canGoForward: false,
  url: '',
}))

function installPreviewIpc() {
  ;(window as Window & { ipcRendererChannel?: unknown }).ipcRendererChannel = {
    SyncSandboxOutputView: { invoke: syncInvoke },
    NavigateSandboxOutputView: { invoke: navigateInvoke },
    SandboxOutputViewNavigationChanged: {
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  }
}

function mountPanel(
  props: Partial<InstanceType<typeof ReportPanel>['$props']> = {},
): VueWrapper {
  return mount(ReportPanel, {
    props: {
      sandboxRuns: [
        {
          id: 'run-1',
          label: 'Run 1',
          resultsFileUrl: 'file:///tmp/sandbox/output/results',
        },
      ],
      selectedRunId: 'run-1',
      linkTabs: [],
      activeLinkTabId: null,
      previewSource: 'sandbox-run',
      ...props,
    },
    global: {
      stubs: {
        UIcon: { template: '<span class="uicon" />' },
      },
    },
  })
}

beforeEach(() => {
  syncInvoke.mockClear()
  navigateInvoke.mockClear()
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

describe('ReportPanel preview tabs', () => {
  it('always shows an add-tab control and emits add-link-tab', async () => {
    const wrapper = mountPanel()
    const add = wrapper.get('button.cp-tab--add')
    expect(add.attributes('aria-label')).toBe('Add new preview tab')

    await add.trigger('click')
    expect(wrapper.emitted('add-link-tab')).toHaveLength(1)
    wrapper.unmount()
  })

  it('clears the address bar when switching to an empty link tab', async () => {
    const emptyTab: PreviewLinkTab = {
      id: 'link:empty:1',
      url: '',
      label: 'New tab',
    }
    const wrapper = mountPanel({
      previewSource: 'sandbox-run',
    })
    expect(wrapper.get('input.report-panel-url-input').element.value).toBe(
      'file:///tmp/sandbox/output/results',
    )

    await wrapper.setProps({
      linkTabs: [emptyTab],
      activeLinkTabId: emptyTab.id,
      previewSource: 'link',
    })
    await nextTick()

    expect(wrapper.get('input.report-panel-url-input').element.value).toBe('')
    expect(wrapper.find('.report-panel-placeholder').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not navigate while typing into an empty tab', async () => {
    const emptyTab: PreviewLinkTab = {
      id: 'link:empty:1',
      url: '',
      label: 'New tab',
    }
    const wrapper = mountPanel({
      linkTabs: [emptyTab],
      activeLinkTabId: emptyTab.id,
      previewSource: 'link',
    })
    await flushPromises()
    syncInvoke.mockClear()

    const input = wrapper.get('input.report-panel-url-input')
    await input.setValue('www.google.com')
    await nextTick()
    await flushPromises()

    const fileUrls = syncInvoke.mock.calls.map(
      (call) => (call[0] as { fileUrl?: string | null } | undefined)?.fileUrl,
    )
    expect(fileUrls.every((url) => url == null || url === '')).toBe(true)
    expect(wrapper.emitted('update-link-tab-url')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits update-link-tab-url on enter with the typed value', async () => {
    const emptyTab: PreviewLinkTab = {
      id: 'link:empty:1',
      url: '',
      label: 'New tab',
    }
    const wrapper = mountPanel({
      linkTabs: [emptyTab],
      activeLinkTabId: emptyTab.id,
      previewSource: 'link',
    })

    const input = wrapper.get('input.report-panel-url-input')
    await input.setValue('www.google.com')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.emitted('update-link-tab-url')?.[0]).toEqual([
      { tabId: emptyTab.id, url: 'www.google.com' },
    ])
    wrapper.unmount()
  })

  it('ignores leftover navigation events for empty link tabs', async () => {
    const emptyTab: PreviewLinkTab = {
      id: 'link:empty:1',
      url: '',
      label: 'New tab',
    }
    const wrapper = mountPanel({
      linkTabs: [emptyTab],
      activeLinkTabId: emptyTab.id,
      previewSource: 'link',
    })
    await nextTick()

    const on = (
      window.ipcRendererChannel as {
        SandboxOutputViewNavigationChanged: {
          on: ReturnType<typeof vi.fn>
        }
      }
    ).SandboxOutputViewNavigationChanged.on
    const listener = on.mock.calls[0]?.[0] as
      | ((
          event: unknown,
          payload: { canGoBack: boolean; canGoForward: boolean; url: string },
        ) => void)
      | undefined
    expect(listener).toBeTypeOf('function')

    listener?.(null, {
      canGoBack: false,
      canGoForward: false,
      url: 'file:///tmp/sandbox/output/results',
    })
    await nextTick()

    expect(wrapper.get('input.report-panel-url-input').element.value).toBe('')
    expect(wrapper.emitted('update-link-tab-url')).toBeUndefined()
    wrapper.unmount()
  })

  it('opens a link tab when sandbox address bar navigates elsewhere', async () => {
    const wrapper = mountPanel({ previewSource: 'sandbox-run' })
    const input = wrapper.get('input.report-panel-url-input')
    await input.setValue('example.com')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.emitted('open-preview-url')?.[0]).toEqual(['example.com'])
    wrapper.unmount()
  })

  it('restores the sandbox URL when switching back from a link tab', async () => {
    const linkTab: PreviewLinkTab = {
      id: 'link:1',
      url: 'https://example.com/',
      label: 'example.com',
    }
    const wrapper = mountPanel({
      linkTabs: [linkTab],
      activeLinkTabId: linkTab.id,
      previewSource: 'link',
    })
    expect(wrapper.get('input.report-panel-url-input').element.value).toBe(
      'https://example.com/',
    )

    await wrapper.setProps({
      previewSource: 'sandbox-run',
      activeLinkTabId: null,
    })
    await nextTick()

    expect(wrapper.get('input.report-panel-url-input').element.value).toBe(
      'file:///tmp/sandbox/output/results',
    )
    wrapper.unmount()
  })
})
