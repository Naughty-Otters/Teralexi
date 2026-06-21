import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fingerprintFromMetafile,
  isSkillModuleBundleStale,
  loadCachedCommonJsModule,
  resolveAppRoot,
  shouldRebuildSkillModuleBundle,
  toOnDiskAppPath,
  writeSkillModuleBundleFingerprint,
} from './skill-module-cache'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/Applications/OpenFDE.app/Contents/Resources/app.asar' },
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeHome: () => '/Users/test/.openfde',
}))

vi.mock('@main/config/app-paths', () => ({
  isPackagedApp: () => false,
  resolveAppRoot: () => process.cwd(),
  toOnDiskAppPath: (filePath: string) => filePath,
}))

describe('skill-module-cache', () => {
  let tempRoot = ''

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('rebuilds when fingerprint sidecar is missing', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skill-cache-'))
    const outJs = join(tempRoot, 'bundle.js')
    writeFileSync(outJs, 'module.exports = {}', 'utf8')
    expect(shouldRebuildSkillModuleBundle(outJs)).toBe(true)
  })

  it('rebuilds when a bundled input file changes', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skill-cache-'))
    const outJs = join(tempRoot, 'bundle.js')
    const depPath = join(tempRoot, 'dep.ts')
    writeFileSync(outJs, 'module.exports = {}', 'utf8')
    writeFileSync(depPath, 'export const x = 1', 'utf8')
    writeSkillModuleBundleFingerprint(outJs, {
      inputs: { [depPath]: statSync(depPath).mtimeMs },
    })

    expect(shouldRebuildSkillModuleBundle(outJs)).toBe(false)

    const later = new Date(Date.now() + 5_000)
    writeFileSync(depPath, 'export const x = 2', 'utf8')
    writeFileSync(depPath, 'export const x = 2\n', 'utf8')

    expect(isSkillModuleBundleStale({
      inputs: { [depPath]: statSync(depPath).mtimeMs - 10_000 },
    })).toBe(true)
  })

  it('fingerprintFromMetafile records input mtimes', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skill-cache-'))
    const depPath = join(tempRoot, 'dep.ts')
    writeFileSync(depPath, 'export const ok = true', 'utf8')
    const mtime = statSync(depPath).mtimeMs

    const fingerprint = fingerprintFromMetafile({
      inputs: {
        [depPath]: {
          bytes: 10,
          imports: [],
        },
      },
      outputs: {},
    })

    expect(fingerprint.inputs[depPath]).toBe(mtime)
  })

  it('loadCachedCommonJsModule resolves npm deps outside the app tree', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'skill-cache-'))
    const outJs = join(tempRoot, 'bundle.js')
    writeFileSync(
      outJs,
      "module.exports = { hasZod: !!require('zod') }",
      'utf8',
    )

    expect(loadCachedCommonJsModule(outJs)).toEqual({ hasZod: true })
  })

  it('toOnDiskAppPath leaves dev paths unchanged', async () => {
    const { toOnDiskAppPath: mapPath } = await import('./skill-module-cache')
    const devPath = join(process.cwd(), 'toolSet', 'index.ts')
    expect(mapPath(devPath)).toBe(devPath)
  })

  it('toOnDiskAppPath maps asar paths to asar.unpacked when packaged', async () => {
    vi.doMock('@main/config/app-paths', () => ({
      isPackagedApp: () => true,
      resolveAppRoot: () =>
        '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked',
      toOnDiskAppPath: (filePath: string) =>
        filePath.replace(/app\.asar(?=\/|$)/i, 'app.asar.unpacked'),
    }))
    vi.resetModules()
    const { toOnDiskAppPath: mapPath, resolveAppRoot: appRoot } = await import(
      './skill-module-cache'
    )
    expect(appRoot()).toBe(
      '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked',
    )
    expect(
      mapPath('/Applications/OpenFDE.app/Contents/Resources/app.asar/skills/demo/actions/index.ts'),
    ).toBe(
      '/Applications/OpenFDE.app/Contents/Resources/app.asar.unpacked/skills/demo/actions/index.ts',
    )
    vi.resetModules()
    vi.doMock('@main/config/app-paths', () => ({
      isPackagedApp: () => false,
      resolveAppRoot: () => process.cwd(),
      toOnDiskAppPath: (filePath: string) => filePath,
    }))
  })
})
