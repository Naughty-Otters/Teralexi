import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () =>
      '/Applications/OpenFDE.app/Contents/Resources/app.asar',
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
          '/Applications/OpenFDE.app/Contents/Resources/app.asar',
      },
    }))
    vi.resetModules()
    const { resolveAppRoot, joinAppResourcePath, toOnDiskAppPath } =
      await import('./app-paths')
    expect(resolveAppRoot()).toBe(
      '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked',
    )
    expect(joinAppResourcePath('skills')).toBe(
      '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked/skills',
    )
    expect(joinAppResourcePath('toolSet')).toBe(
      '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked/toolSet',
    )
    expect(
      toOnDiskAppPath(
        '/Applications/OpenFDE.app/Contents/Resources/app.asar/toolSet/index.ts',
      ),
    ).toBe(
      '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked/toolSet/index.ts',
    )
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getAppPath: () =>
          '/Applications/OpenFDE.app/Contents/Resources/app.asar',
      },
    }))
  })
})
