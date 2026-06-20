import { describe, expect, it, vi, beforeEach } from 'vitest'

const printToPDF = vi.hoisted(() => vi.fn(async () => Buffer.from('%PDF-mock')))
const destroy = vi.hoisted(() => vi.fn())
const loadFile = vi.hoisted(() => vi.fn(async () => undefined))
const executeJavaScript = vi.hoisted(() => vi.fn(async () => undefined))
const writeFileMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('electron', () => {
  class MockBrowserWindow {
    loadFile = loadFile
    webContents = {
      printToPDF,
      executeJavaScript,
      once(event: string, listener: (...args: unknown[]) => void) {
        if (event === 'did-finish-load') {
          queueMicrotask(() => listener())
        }
      },
      removeListener() {},
    }
    isDestroyed() {
      return false
    }
    destroy = destroy
  }
  return { BrowserWindow: MockBrowserWindow }
})

vi.mock('node:fs/promises', () => ({
  writeFile: writeFileMock,
}))

import { exportHtmlFileToPdf } from './html-to-pdf'

describe('exportHtmlFileToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads HTML, waits for fonts, and writes a PDF file', async () => {
    await exportHtmlFileToPdf('/tmp/page.html', '/tmp/page.pdf')

    expect(loadFile).toHaveBeenCalledWith('/tmp/page.html')
    expect(executeJavaScript).toHaveBeenCalled()
    expect(printToPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        printBackground: true,
        pageSize: 'A4',
        marginsType: 1,
        preferCSSPageSize: true,
      }),
    )
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/page.pdf', Buffer.from('%PDF-mock'))
    expect(destroy).toHaveBeenCalled()
  })
})
