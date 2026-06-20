import { describe, expect, it } from 'vitest'
import {
  fastGlobIgnorePatterns,
  parseIncludePackageFiles,
  ripgrepExcludeGlobArgs,
  shouldSkipListingEntry,
  shouldSkipRelativePath,
} from './workspace-scan-filters'

describe('workspace-scan-filters', () => {
  it('defaults include_package_files to false', () => {
    expect(parseIncludePackageFiles({})).toBe(false)
    expect(parseIncludePackageFiles({ include_package_files: true })).toBe(true)
  })

  it('skips hidden and package dirs when include_package_files is false', () => {
    expect(shouldSkipListingEntry('.env', false, false)).toBe(true)
    expect(shouldSkipListingEntry('node_modules', true, false)).toBe(true)
    expect(shouldSkipListingEntry('src', true, false)).toBe(false)
    expect(shouldSkipListingEntry('node_modules', true, true)).toBe(false)
  })

  it('skips paths under excluded segments', () => {
    expect(shouldSkipRelativePath('src/index.ts', false)).toBe(false)
    expect(shouldSkipRelativePath('node_modules/pkg/index.js', false)).toBe(true)
    expect(shouldSkipRelativePath('.git/config', false)).toBe(true)
    expect(shouldSkipRelativePath('venv/lib/site-packages/foo.py', false)).toBe(
      true,
    )
    expect(shouldSkipRelativePath('node_modules/pkg/index.js', true)).toBe(false)
  })

  it('emits ripgrep exclude globs only when package files are excluded', () => {
    expect(ripgrepExcludeGlobArgs(true)).toEqual([])
    expect(ripgrepExcludeGlobArgs(false)).toContain('-g')
    expect(ripgrepExcludeGlobArgs(false)).toContain('!**/node_modules/**')
  })

  it('emits fast-glob ignore patterns when package files are excluded', () => {
    expect(fastGlobIgnorePatterns(true)).toEqual([])
    expect(fastGlobIgnorePatterns(false)).toContain('**/node_modules/**')
  })
})
