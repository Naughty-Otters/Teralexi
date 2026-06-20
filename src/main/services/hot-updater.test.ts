import { describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() =>
      vi.fn(async () => ({
        data: { version: '0.0.1', name: 'pkg.zip', hash: 'abc' },
      })),
    ),
  },
}))

vi.mock('fs-extra', () => ({
  emptyDir: vi.fn(),
  createWriteStream: vi.fn(),
  readFile: vi.fn(async () => Buffer.from('data')),
  copy: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('adm-zip', () => ({
  default: vi.fn().mockImplementation(() => ({
    extractAllTo: vi.fn(),
  })),
}))

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/app') },
  BrowserWindow: { fromWebContents: vi.fn() },
}))

vi.mock('./web-content-send', () => ({
  webContentSend: { HotUpdateStatus: vi.fn() },
}))

vi.mock('../config/hot-publish', () => ({
  hotPublishConfig: { url: 'https://hot', configName: 'cfg' },
}))

import { hotUpdaterIpcHandlers, updater } from './hot-updater'

describe('hot-updater', () => {
  it('updater completes without throwing when no newer version', async () => {
    await expect(updater()).resolves.toBeUndefined()
  })

  it('exposes ipc handler metadata', () => {
    expect(hotUpdaterIpcHandlers.channel).toBe('HotUpdate')
    expect(typeof hotUpdaterIpcHandlers.handler).toBe('function')
  })
})
