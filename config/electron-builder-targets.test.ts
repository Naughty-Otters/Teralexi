import { describe, expect, it } from 'vitest'
import { detectElectronBuilderTargets } from './electron-builder-targets'

describe('detectElectronBuilderTargets', () => {
  it('detects explicit --mac / --win flags', () => {
    expect(detectElectronBuilderTargets(['--mac'], 'linux')).toEqual({
      buildingMac: true,
      buildingWin: false,
      buildingLinux: false,
    })
    expect(detectElectronBuilderTargets(['--win', '--x64'], 'darwin')).toEqual({
      buildingMac: false,
      buildingWin: true,
      buildingLinux: false,
    })
  })

  it('defaults to host platform when no target flag is passed (npm run build)', () => {
    expect(detectElectronBuilderTargets(['-c', 'build.json'], 'darwin')).toEqual({
      buildingMac: true,
      buildingWin: false,
      buildingLinux: false,
    })
    expect(detectElectronBuilderTargets(['-c', 'build.json'], 'win32')).toEqual({
      buildingMac: false,
      buildingWin: true,
      buildingLinux: false,
    })
  })
})
