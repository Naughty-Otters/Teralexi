/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import WebsitePublishDialog from './WebsitePublishDialog.vue'

vi.mock('@renderer/lib/open-external-url', () => ({
  openExternalUrl: vi.fn(),
}))

function mountDialog(
  props: InstanceType<typeof WebsitePublishDialog>['$props'],
): VueWrapper {
  return mount(WebsitePublishDialog, {
    props,
    // Keep dialog content in-wrapper so tests can query without Teleport leftovers.
    global: { stubs: { teleport: true } },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('WebsitePublishDialog', () => {
  it('renders confirm summary and emits confirm/cancel', async () => {
    const wrapper = mountDialog({
      open: true,
      phase: 'confirm',
      preview: {
        ok: true,
        title: 'Publish website',
        siteDir: '/tmp/site',
        fileCount: 3,
        estimatedBytes: 2048,
        sampleFiles: ['index.html', 'a.css'],
        truncatedRemaining: 1,
        targetHost: 'localhost:8000',
        uploadPath: 'api/v1/app/web/upload',
      },
      result: null,
    })

    expect(wrapper.text()).toContain('Publish website')
    expect(wrapper.text()).toContain('index.html')
    expect(wrapper.text()).toContain('…and 1 more')

    const values = wrapper.findAll('input').map((i) => i.element.value)
    expect(values).toContain('/tmp/site')
    expect(values).toContain('3')
    expect(values).toContain('2.0 KB')
    expect(values).toContain('localhost:8000/api/v1/app/web/upload')

    await wrapper.get('button.wp-btn--primary').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)

    const cancel = wrapper
      .findAll('button.wp-btn')
      .find((b) => b.text().includes('Cancel'))
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    wrapper.unmount()
  })

  it('renders publishing busy state', () => {
    const wrapper = mountDialog({
      open: true,
      phase: 'publishing',
      preview: { ok: true, title: 'Publish website' },
      result: null,
    })
    expect(wrapper.text()).toMatch(/Packaging and uploading/i)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('renders success result with URL and HTTP statuses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mountDialog({
      open: true,
      phase: 'result',
      preview: null,
      result: {
        ok: true,
        absoluteUrl: 'http://localhost:8000/app/web/1/',
        uploadStatus: 200,
        verifyStatus: 200,
        fileCount: 2,
        bytes: 1024,
      },
    })

    expect(wrapper.text()).toContain('Published')
    const values = wrapper.findAll('input').map((i) => i.element.value)
    expect(values).toContain('http://localhost:8000/app/web/1/')
    expect(values).toContain('200')
    expect(values).toContain('2')
    expect(values).toContain('1.0 KB')

    const copyBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Copy'))
    await copyBtn!.trigger('click')
    expect(writeText).toHaveBeenCalledWith('http://localhost:8000/app/web/1/')

    const closeBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Close'))
    await closeBtn!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders failure result with error and optional HTTP status', () => {
    const wrapper = mountDialog({
      open: true,
      phase: 'result',
      preview: { ok: false, error: 'No publishable site found.' },
      result: {
        ok: false,
        error: 'Weekly publish limit reached',
        uploadStatus: 303,
      },
    })
    expect(wrapper.text()).toContain('Publish failed')
    expect(wrapper.text()).toContain('Weekly publish limit reached')
    const values = wrapper.findAll('input').map((i) => i.element.value)
    expect(values).toContain('303')
    wrapper.unmount()
  })

  it('does not render when closed', () => {
    const wrapper = mountDialog({
      open: false,
      phase: 'confirm',
      preview: null,
      result: null,
    })
    expect(wrapper.find('.wp-dialog').exists()).toBe(false)
    wrapper.unmount()
  })
})
