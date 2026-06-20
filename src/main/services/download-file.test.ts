import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/downloads') },
  BrowserWindow: vi.fn(),
  dialog: { showErrorBox: vi.fn() },
}))

vi.mock('fs-extra', () => ({
  stat: vi.fn((_p, cb) => cb(null, null)),
  remove: vi.fn(),
}))

vi.mock('./web-content-send', () => ({
  webContentSend: new Proxy({}, { get: () => vi.fn() }),
}))

import DownloadFile from './download-file'

describe('DownloadFile', () => {
  it('constructs with default platform download url when baseUrl empty', () => {
    const sessionOn = vi.fn()
    const mainWindow = {
      webContents: {
        session: { on: sessionOn },
        downloadURL: vi.fn(),
      },
    } as unknown as Electron.BrowserWindow
    const dl = new DownloadFile(mainWindow)
    expect(dl.downloadUrl).toMatch(/electron_.*\.(exe|dmg)/)
    expect(sessionOn).toHaveBeenCalledWith('will-download', expect.any(Function))
  })
})
