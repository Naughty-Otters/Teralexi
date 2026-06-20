import { describe, expect, it, vi } from 'vitest'
import { webContentSend } from './web-content-send'

describe('webContentSend', () => {
  it('proxies channel sends to webContents', () => {
    const send = vi.fn()
    const wc = { send } as unknown as Electron.WebContents
    webContentSend.DownloadProgress(wc, 50)
    expect(send).toHaveBeenCalledWith('DownloadProgress', 50)
  })
})
