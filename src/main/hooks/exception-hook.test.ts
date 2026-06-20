import { describe, expect, it, vi } from 'vitest'

const { on, showMessageBox } = vi.hoisted(() => ({
  on: vi.fn(),
  showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
}))

vi.mock('electron', () => ({
  app: { on, disableHardwareAcceleration: vi.fn() },
  dialog: { showMessageBox },
}))

import { useProcessException } from './exception-hook'

describe('useProcessException', () => {
  it('registers render-process-gone listener', () => {
    const { renderProcessGone } = useProcessException()
    renderProcessGone()
    expect(on).toHaveBeenCalledWith('render-process-gone', expect.any(Function))
  })

  it('uses custom listener when provided', () => {
    const listener = vi.fn()
    const { renderProcessGone } = useProcessException()
    renderProcessGone(listener)
    const handler = on.mock.calls.find((c) => c[0] === 'render-process-gone')?.[1]
    handler?.({}, { reload: vi.fn(), close: vi.fn() }, { reason: 'crashed', exitCode: 1 })
    expect(listener).toHaveBeenCalled()
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('registers child-process-gone and window unresponsive handlers', () => {
    const { childProcessGone, mainWindowGone } = useProcessException()
    const win = { on: vi.fn(), reload: vi.fn(), close: vi.fn(), isDestroyed: () => false }
    childProcessGone(win as never)
    mainWindowGone(win as never)
    expect(on).toHaveBeenCalledWith('child-process-gone', expect.any(Function))
    expect(win.on).toHaveBeenCalledWith('unresponsive', expect.any(Function))
  })
})
