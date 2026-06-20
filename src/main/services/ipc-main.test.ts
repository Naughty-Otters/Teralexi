import { describe, expect, it, vi } from 'vitest'

const { handle } = vi.hoisted(() => ({
  handle: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle },
}))

vi.mock('./ipc-main-handle', () => ({
  IpcMainHandleClass: class MockIpcMainHandleClass {
    Ping = vi.fn()
    GetSystemConfig = vi.fn()
  },
}))

import { useMainDefaultIpc } from './ipc-main'

describe('useMainDefaultIpc', () => {
  it('registers ipc handlers from handle class', () => {
    const { defaultIpc } = useMainDefaultIpc()
    defaultIpc()
    expect(handle).toHaveBeenCalledWith('Ping', expect.any(Function))
    expect(handle).toHaveBeenCalledWith('GetSystemConfig', expect.any(Function))
  })
})
