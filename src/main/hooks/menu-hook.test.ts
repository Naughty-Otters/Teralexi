import { describe, expect, it, vi } from 'vitest'

const { buildFromTemplate, setApplicationMenu } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn(() => ({})),
  setApplicationMenu: vi.fn(),
}))

vi.mock('electron', () => ({
  Menu: { buildFromTemplate, setApplicationMenu },
  dialog: { showMessageBox: vi.fn() },
}))

vi.mock('os', () => ({
  type: () => 'darwin',
  arch: () => 'arm64',
  release: () => '24.0',
}))

import { useMenu } from './menu-hook'

describe('useMenu', () => {
  it('builds and sets application menu', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    const { createMenu } = useMenu()
    createMenu()
    expect(buildFromTemplate).toHaveBeenCalled()
    expect(setApplicationMenu).toHaveBeenCalled()
    process.env.NODE_ENV = prev
  })

  it('adds devtools menu in development', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    buildFromTemplate.mockClear()
    const { createMenu } = useMenu()
    createMenu()
    const template = buildFromTemplate.mock.calls.at(-1)?.[0] as Array<{ label: string }>
    expect(template.some((item) => item.label === 'Developer Settings')).toBe(true)
    process.env.NODE_ENV = prev
  })
})
