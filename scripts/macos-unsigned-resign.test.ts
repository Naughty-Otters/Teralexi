import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findMacAppBundles } from './macos-unsigned-resign'

describe('macos-unsigned-resign', () => {
  it('findMacAppBundles discovers apps under build/mac-*', () => {
    const root = mkdtempSync(join(tmpdir(), 'openfde-find-mac-app-'))
    const appDir = join(root, 'mac-arm64')
    mkdirSync(appDir, { recursive: true })
    mkdirSync(join(appDir, 'OpenFDE.app', 'Contents', 'MacOS'), {
      recursive: true,
    })
    writeFileSync(join(appDir, 'OpenFDE.app', 'Contents', 'MacOS', 'OpenFDE'), '')

    expect(findMacAppBundles(root)).toEqual([join(appDir, 'OpenFDE.app')])
  })
})
