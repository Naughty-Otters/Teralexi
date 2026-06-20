import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fingerprintFromMetafile,
  isSkillModuleBundleStale,
  shouldRebuildSkillModuleBundle,
  writeSkillModuleBundleFingerprint,
} from './skill-module-cache'

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
})
