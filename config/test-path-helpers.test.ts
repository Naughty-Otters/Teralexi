import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expectedOpenfdeHomeForPlatform,
  fakeOtherRepoForPlatform,
  fakeRepo,
  fakeRepoForPlatform,
  fakeSandbox,
  fakeSandboxForPlatform,
  isUnix,
  isWin,
  isWindowsPlatform,
  lspBinName,
  lspBinNameForPlatform,
  mockHomedir,
  mockHomedirForPlatform,
  mockOpenfdeDirForPlatform,
  mockTesterHomedirForPlatform,
  p,
  pathEndsWith,
  pathIncludes,
  pathsEqual,
} from './test-path-helpers'

describe('test-path-helpers', () => {
  describe('p / pathsEqual / pathEndsWith / pathIncludes', () => {
    it('normalizes mixed separators for comparison', () => {
      expect(p('C:\\sandbox\\out\\file.txt')).toBe('C:/sandbox/out/file.txt')
      expect(p('/sandbox/out/file.txt')).toBe('/sandbox/out/file.txt')
      expect(pathsEqual('C:\\sandbox\\out', 'C:/sandbox/out')).toBe(true)
      expect(pathsEqual('/repo/env/.signing.env', '\\repo\\env\\.signing.env')).toBe(
        true,
      )
      expect(pathsEqual('C:\\sandbox', 'D:\\sandbox')).toBe(false)
    })

    it('matches suffixes and substrings regardless of separator style', () => {
      expect(pathEndsWith('C:\\repo\\env\\.signing.env', 'env/.signing.env')).toBe(
        true,
      )
      expect(pathEndsWith('/repo/env/.sit.env', '\\repo\\env\\.sit.env')).toBe(true)
      expect(pathIncludes('D:\\mock-home\\.openfde\\skills', '.openfde/skills')).toBe(
        true,
      )
    })
  })

  describe.each([
    ['darwin', false],
    ['linux', false],
    ['win32', true],
  ] as const)('platform %s', (platform, windows) => {
    it('detects Windows platform', () => {
      expect(isWindowsPlatform(platform)).toBe(windows)
    })

    it('returns stable mock paths', () => {
      expect(mockHomedirForPlatform(platform)).toBe(
        windows ? 'C:\\mock-home' : '/mock-home',
      )
      expect(mockTesterHomedirForPlatform(platform)).toBe(
        windows ? 'C:\\Users\\tester' : '/Users/tester',
      )
      expect(fakeSandboxForPlatform(platform)).toBe(
        windows ? 'C:\\sandbox' : '/sandbox',
      )
      expect(fakeRepoForPlatform(platform)).toBe(
        windows ? 'C:\\repo' : '/repo',
      )
      expect(fakeOtherRepoForPlatform(platform)).toBe(
        windows ? 'C:\\other\\repo' : '/other/repo',
      )
    })

    it('builds openfde home and nested dirs with join()', () => {
      const home = expectedOpenfdeHomeForPlatform(platform)
      expect(p(home)).toBe(
        p(resolve(join(mockHomedirForPlatform(platform), '.openfde'))),
      )
      expect(mockOpenfdeDirForPlatform(platform, 'skills', 'demo')).toBe(
        join(mockHomedirForPlatform(platform), '.openfde', 'skills', 'demo'),
      )
    })

    it('names LSP bin wrappers per platform', () => {
      expect(lspBinNameForPlatform('typescript-language-server', platform)).toBe(
        windows ? 'typescript-language-server.cmd' : 'typescript-language-server',
      )
    })
  })

  describe('host runtime helpers', () => {
    it('match the current process.platform', () => {
      expect(fakeSandbox()).toBe(fakeSandboxForPlatform(process.platform))
      expect(fakeRepo()).toBe(fakeRepoForPlatform(process.platform))
      expect(mockHomedir()).toBe(mockHomedirForPlatform(process.platform))
      expect(lspBinName('tsserver')).toBe(
        lspBinNameForPlatform('tsserver', process.platform),
      )
      expect(isWin).toBe(process.platform === 'win32')
      expect(isUnix).toBe(process.platform !== 'win32')
    })
  })
})
