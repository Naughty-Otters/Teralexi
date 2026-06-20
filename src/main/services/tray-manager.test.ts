import { describe, expect, it, vi } from 'vitest'

const { Tray } = vi.hoisted(() => ({
  Tray: vi.fn().mockImplementation(function TrayMock() {
    return {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
    }
  }),
}))

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => false })) },
  Tray,
}))

vi.mock('../config/app-icons', () => ({
  loadTrayIcon: vi.fn(() => ({ isEmpty: () => false })),
  APP_DISPLAY_NAME: 'Moderatus',
}))

import { createTray, destroyTray } from './tray-manager'

describe('tray-manager', () => {
  it('creates and destroys tray', () => {
    const win = {
      isVisible: () => true,
      hide: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    } as unknown as Electron.BrowserWindow
    const tray = createTray(() => win)
    expect(Tray).toHaveBeenCalled()
    expect(tray).toBeDefined()
    destroyTray()
  })
})
