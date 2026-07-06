import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { p } from '@test-paths'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () =>
      '/Applications/Teralexi.app/Contents/Resources/app.asar',
  },
}))

describe('app-paths', () => {
  it('joinAppResourcePath uses cwd in dev', async () => {
    const { joinAppResourcePath } = await import('./app-paths')
    expect(joinAppResourcePath('toolSet')).toBe(join(process.cwd(), 'toolSet'))
  })

  it('resolveAppRoot and joinAppResourcePath use asar.unpacked when packaged', async () => {
    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getAppPath: () =>
          '/Applications/Teralexi.app/Contents/Resources/app.asar',
      },
    }))
    vi.resetModules()
    const { resolveAppRoot, joinAppResourcePath, toOnDiskAppPath } =
      await import('./app-paths')
    const unpacked = '/Applications/Teralexi.app/Contents/Resources/app.asar.unpacked'
    expect(p(resolveAppRoot())).toBe(p(unpacked))
    expect(p(joinAppResourcePath('skills'))).toBe(p(join(unpacked, 'skills')))
    expect(p(joinAppResourcePath('toolSet'))).toBe(p(join(unpacked, 'toolSet')))
    expect(p(joinAppResourcePath('.teralexi', 'rules'))).toBe(
      p(join(unpacked, '.teralexi', 'rules')),
    )
    expect(
      p(
        toOnDiskAppPath(
          '/Applications/Teralexi.app/Contents/Resources/app.asar/toolSet/index.ts',
        ),
      ),
    ).toBe(p(join(unpacked, 'toolSet', 'index.ts')))
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getAppPath: () =>
          '/Applications/Teralexi.app/Contents/Resources/app.asar',
      },
    }))
  })
})
