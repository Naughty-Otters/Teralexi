import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import {
  detectWorkspaceWrites,
  snapshotWorkspaceGuard,
} from './run-script-workspace-guard'
import { findChangedFiles } from './run-script-artifacts'

describe('run-script-workspace-guard', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('skips node_modules when snapshotting workspace', async () => {
    dir = join(tmpdir(), `ws-guard-${Date.now()}`)
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(dir, 'node_modules', 'pkg', 'index.js'), 'x', 'utf8')
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src', 'app.ts'), 'app', 'utf8')

    const snap = await snapshotWorkspaceGuard(dir)
    expect([...snap.keys()].some((p) => p.includes('node_modules'))).toBe(false)
    expect([...snap.keys()].some((p) => p.endsWith('app.ts'))).toBe(true)
  })

  it('detects new workspace files after script run', async () => {
    dir = join(tmpdir(), `ws-writes-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const before = await snapshotWorkspaceGuard(dir)
    await writeFile(join(dir, 'out.txt'), 'pollution', 'utf8')
    const after = await snapshotWorkspaceGuard(dir)
    const writes = detectWorkspaceWrites({
      workspaceRoot: dir,
      before,
      after,
    })
    expect(writes).toEqual(['out.txt'])
    expect(findChangedFiles(before, after).length).toBe(1)
  })
})
