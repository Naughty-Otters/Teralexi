import { mkdir, writeFile, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import {
  buildWorkspaceWriteFileChanges,
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

  it('detects deleted workspace files', async () => {
    dir = join(tmpdir(), `ws-del-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'gone.txt'), 'bye', 'utf8')
    const before = await snapshotWorkspaceGuard(dir, { captureTextContent: true })
    await unlink(join(dir, 'gone.txt'))
    const after = await snapshotWorkspaceGuard(dir)
    const writes = detectWorkspaceWrites({
      workspaceRoot: dir,
      before,
      after,
    })
    expect(writes).toEqual(['gone.txt'])
  })

  it('builds file-change previews for create/modify when content was captured', async () => {
    dir = join(tmpdir(), `ws-diff-${Date.now()}`)
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src', 'a.ts'), 'old\n', 'utf8')
    const before = await snapshotWorkspaceGuard(dir, { captureTextContent: true })
    expect(before.get(join(dir, 'src', 'a.ts'))?.content).toBe('old\n')

    // Different byte length so findChangedFiles still detects the edit when
    // mtime resolution is coarse (common on Windows CI runners).
    await writeFile(join(dir, 'src', 'a.ts'), 'new-content\n', 'utf8')
    await writeFile(join(dir, 'src', 'b.ts'), 'created\n', 'utf8')
    const after = await snapshotWorkspaceGuard(dir)
    const writes = detectWorkspaceWrites({
      workspaceRoot: dir,
      before,
      after,
    })
    expect(writes.sort()).toEqual(['src/a.ts', 'src/b.ts'])
    const files = await buildWorkspaceWriteFileChanges({
      workspaceRoot: dir,
      before,
      after,
      relativeWrites: writes,
    })

    expect(files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts'])
    const modified = files.find((f) => f.path === 'src/a.ts')
    const created = files.find((f) => f.path === 'src/b.ts')
    expect(modified?.action).toBe('modify')
    expect(modified?.diff).toContain('-old')
    expect(modified?.diff).toContain('+new-content')
    expect(modified?.workspacePath).toBe(dir)
    expect(created?.action).toBe('create')
    expect(created?.diff).toContain('+created')
  })
})
