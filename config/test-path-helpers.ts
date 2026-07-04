import { join, normalize, resolve } from 'node:path'

export type TestPlatform = NodeJS.Platform | string

export const isWin = process.platform === 'win32'
export const isUnix = !isWin

/** Normalize separators to forward slashes for stable cross-platform assertions. */
export function p(value: string): string {
  return value.replace(/\\/g, '/')
}

export function pathsEqual(a: string, b: string): boolean {
  return p(normalize(a)) === p(normalize(b))
}

export function pathEndsWith(value: string, suffix: string): boolean {
  return p(value).endsWith(p(suffix))
}

export function pathIncludes(value: string, part: string): boolean {
  return p(value).includes(p(part))
}

export function isWindowsPlatform(platform: TestPlatform): boolean {
  return platform === 'win32'
}

export function mockHomedirForPlatform(platform: TestPlatform): string {
  return isWindowsPlatform(platform) ? 'C:\\mock-home' : '/mock-home'
}

export function mockTesterHomedirForPlatform(platform: TestPlatform): string {
  return isWindowsPlatform(platform) ? 'C:\\Users\\tester' : '/Users/tester'
}

export function fakeSandboxForPlatform(platform: TestPlatform): string {
  return isWindowsPlatform(platform) ? 'C:\\sandbox' : '/sandbox'
}

export function fakeRepoForPlatform(platform: TestPlatform): string {
  return isWindowsPlatform(platform) ? 'C:\\repo' : '/repo'
}

export function fakeOtherRepoForPlatform(platform: TestPlatform): string {
  return isWindowsPlatform(platform) ? 'C:\\other\\repo' : '/other/repo'
}

export function expectedOpenfdeHomeForPlatform(
  platform: TestPlatform,
  home = mockHomedirForPlatform(platform),
): string {
  return resolve(join(home, '.openfde'))
}

export function lspBinNameForPlatform(
  command: string,
  platform: TestPlatform,
): string {
  return isWindowsPlatform(platform) ? `${command}.cmd` : command
}

export function mockOpenfdeDirForPlatform(
  platform: TestPlatform,
  ...segments: string[]
): string {
  return join(mockHomedirForPlatform(platform), '.openfde', ...segments)
}

export function mockHomedir(): string {
  return mockHomedirForPlatform(process.platform)
}

export function mockTesterHomedir(): string {
  return mockTesterHomedirForPlatform(process.platform)
}

export function fakeSandbox(): string {
  return fakeSandboxForPlatform(process.platform)
}

export function fakeRepo(): string {
  return fakeRepoForPlatform(process.platform)
}

export function fakeOtherRepo(): string {
  return fakeOtherRepoForPlatform(process.platform)
}

export function expectedOpenfdeHome(home = mockHomedir()): string {
  return expectedOpenfdeHomeForPlatform(process.platform, home)
}

export function lspBinName(command: string): string {
  return lspBinNameForPlatform(command, process.platform)
}

export function mockOpenfdeDir(...segments: string[]): string {
  return mockOpenfdeDirForPlatform(process.platform, ...segments)
}

export { join, resolve }
