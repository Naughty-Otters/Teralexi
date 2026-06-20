import { describe, expect, it, vi } from 'vitest'

const { register } = vi.hoisted(() => ({
  register: vi.fn(),
}))

vi.mock('electron', () => ({
  globalShortcut: { register },
}))

import { useDisableButton } from './disable-button-hook'

describe('useDisableButton', () => {
  it('registers F12 shortcut handler', () => {
    const { disableF12 } = useDisableButton()
    disableF12()
    expect(register).toHaveBeenCalledWith('f12', expect.any(Function))
  })
})
