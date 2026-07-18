import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isNotAGitRepositoryError,
  resetGitBinaryCache,
  resolveGitBinary,
} from './git-binary'

describe('git-binary', () => {
  const prevEnv = process.env.TERALEXI_GIT_PATH
  let dir: string | undefined

  beforeEach(() => {
    resetGitBinaryCache()
    delete process.env.TERALEXI_GIT_PATH
  })

  afterEach(() => {
    resetGitBinaryCache()
    if (prevEnv === undefined) delete process.env.TERALEXI_GIT_PATH
    else process.env.TERALEXI_GIT_PATH = prevEnv
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('falls back to system git on PATH when no bundle is present', () => {
    expect(resolveGitBinary()).toBe('git')
  })

  it('prefers TERALEXI_GIT_PATH when the file exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-bin-'))
    const fake = join(dir, 'custom-git')
    writeFileSync(fake, '#!/bin/sh\n')
    chmodSync(fake, 0o755)
    process.env.TERALEXI_GIT_PATH = fake
    resetGitBinaryCache()
    expect(resolveGitBinary()).toBe(fake)
  })

  it('detects not-a-repository errors', () => {
    expect(
      isNotAGitRepositoryError(
        'fatal: not a git repository (or any of the parent directories): .git',
      ),
    ).toBe(true)
    expect(isNotAGitRepositoryError('fatal: something else')).toBe(false)
  })
})
