import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join, resolve } from 'path'
import { p } from '@test-paths'
import os from 'os'

vi.mock('fs', () => ({
  realpathSync: vi.fn((p: string) => p),
}))

vi.mock('fs/promises', () => ({
  rm: vi.fn(),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeSandboxDir: vi.fn(() => '/home/.openfde/workspace/sandbox'),
}))

import { rm } from 'fs/promises'
import {
  isRemovableopenfdeSandboxPath,
  removeSandboxDirectories,
} from './cleanup'

describe('remove-sandbox-directories', () => {
  beforeEach(() => {
    vi.mocked(rm).mockReset()
  })

  it('allows paths under openfde sandbox root', () => {
    const p = join('/home/.openfde/workspace/sandbox', 'openfde-sandbox-abc')
    expect(isRemovableopenfdeSandboxPath(p)).toBe(true)
  })

  it('rejects paths outside allowed roots', async () => {
    await removeSandboxDirectories(['/etc/passwd'])
    expect(rm).not.toHaveBeenCalled()
  })

  it('removes allowed sandbox directories', async () => {
    const p = join('/home/.openfde/workspace/sandbox', 'run-1')
    await removeSandboxDirectories([p])
    expect(rm).toHaveBeenCalledWith(resolve(p), { recursive: true, force: true })
  })

  it('allows legacy openfde-sandbox folders under tmpdir', () => {
    const p = join(os.tmpdir(), 'openfde-sandbox-test123')
    expect(isRemovableopenfdeSandboxPath(p)).toBe(true)
  })

  it('logs and continues when rm fails', async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error('busy'))
    const p = join('/home/.openfde/workspace/sandbox', 'run-2')
    await expect(removeSandboxDirectories([p])).resolves.toBeUndefined()
  })
})
