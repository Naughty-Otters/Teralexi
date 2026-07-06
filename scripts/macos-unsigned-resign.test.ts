import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findMacAppBundles } from './macos-unsigned-resign'

describe('macos-unsigned-resign', () => {
  it('findMacAppBundles discovers apps under build/mac-*', () => {
    const root = mkdtempSync(join(tmpdir(), 'teralexi-find-mac-app-'))
    const appDir = join(root, 'mac-arm64')
    mkdirSync(appDir, { recursive: true })
    mkdirSync(join(appDir, 'Teralexi.app', 'Contents', 'MacOS'), {
      recursive: true,
    })
    writeFileSync(join(appDir, 'Teralexi.app', 'Contents', 'MacOS', 'Teralexi'), '')

    expect(findMacAppBundles(root)).toEqual([join(appDir, 'Teralexi.app')])
  })
})
