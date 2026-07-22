import { describe, expect, it } from 'vitest'
import * as fileSystemBarrel from './file-system.ts'
import * as sandboxPaths from './sandbox-paths.ts'

describe('toolSet barrel exports', () => {
  it('exposes file-system APIs through top-level barrel', () => {
    expect(typeof fileSystemBarrel.readFile?.execute).toBe('function')
    expect(typeof fileSystemBarrel.editFiles?.execute).toBe('function')
    expect(typeof fileSystemBarrel.shell?.execute).toBe('function')
    expect(typeof fileSystemBarrel.promoteArtifact?.execute).toBe('function')
    expect(typeof fileSystemBarrel.writeFile?.execute).toBe('function')
    expect(typeof fileSystemBarrel.applyPatch?.execute).toBe('function')
  })

  it('re-exports sandbox path helpers', () => {
    expect(typeof sandboxPaths.requireActiveSandbox).toBe('function')
    expect(typeof sandboxPaths.resolvePathMustBeInside).toBe('function')
    expect(typeof sandboxPaths.isPathInsideSandbox).toBe('function')
    expect(typeof sandboxPaths.setSandboxOutputScope).toBe('function')
  })
})
