import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  gitAdd,
  gitCommit,
  gitDiff,
  gitInit,
  gitLog,
  gitPush,
  searchWorkspaceFiles,
  gitStatus,
  gitStatusToToolShape,
  listWorkspaceFiles,
  resolvePathInsideWorkspace,
  readWorkspaceFileContent,
  writeWorkspaceFileContent,
  MAX_WORKSPACE_EDITOR_BYTES,
  runWorkspaceTerminalCommand,
  type GitStatusResult,
} from './git-service'

function runGit(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('git-service', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('resolvePathInsideWorkspace rejects path escape', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-resolve-'))
    const inside = resolvePathInsideWorkspace(dir, 'src/a.ts')
    expect(inside.ok).toBe(true)
    const escape = resolvePathInsideWorkspace(dir, '../outside')
    expect(escape.ok).toBe(false)
  })

  it('gitDiff returns error result instead of diff text on failure', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-norepo-'))
    const result = await gitDiff(dir, {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeTruthy()
  })

  it('gitStatus reports isRepo false for a non-git folder', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-status-norepo-'))
    const status = await gitStatus(dir)
    expect(status.isRepo).toBe(false)
    expect(status.entries).toEqual([])
    expect(status.error).toBeUndefined()
  })

  it('gitInit creates a repository that gitStatus recognizes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-init-'))
    const before = await gitStatus(dir)
    expect(before.isRepo).toBe(false)

    const init = await gitInit(dir)
    expect(init.ok).toBe(true)

    const after = await gitStatus(dir)
    expect(after.isRepo).toBe(true)
  })

  it('gitDiff includes untracked new files as all-additions diff', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-untracked-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])
    writeFileSync(join(dir, 'new-file.ts'), 'export const x = 1\n')

    const result = await gitDiff(dir, { files: ['new-file.ts'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.diff).toContain('new-file.ts')
    expect(result.diff).toContain('+export const x = 1')
  })

  it('gitStatusToToolShape buckets staged, modified, and untracked', () => {
    const status: GitStatusResult = {
      branch: 'main',
      upstream: 'origin/main',
      ahead: 1,
      behind: 0,
      clean: false,
      isRepo: true,
      entries: [
        { code: 'M ', index: 'M', worktree: ' ', path: 'staged.ts' },
        { code: ' M', index: ' ', worktree: 'M', path: 'modified.ts' },
        { code: '??', index: '?', worktree: '?', path: 'new.ts' },
      ],
    }
    const shape = gitStatusToToolShape(status)
    expect(shape.staged).toEqual(['staged.ts'])
    expect(shape.modified).toEqual(['modified.ts'])
    expect(shape.untracked).toEqual(['new.ts'])
    expect(shape.clean).toBe(false)
  })

  it('listWorkspaceFiles lists immediate children with git status', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-list-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])
    writeFileSync(join(dir, 'tracked.txt'), 'a\n')
    runGit(dir, ['add', 'tracked.txt'])
    runGit(dir, ['commit', '-m', 'init'])
    writeFileSync(join(dir, 'tracked.txt'), 'changed\n')

    const status = await gitStatus(dir)
    expect(status.entries.some((e) => e.path === 'tracked.txt')).toBe(true)

    const listed = await listWorkspaceFiles(dir)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    expect(listed.entries.map((e) => e.name)).toContain('tracked.txt')
    const tracked = listed.entries.find((e) => e.name === 'tracked.txt')
    expect(tracked?.gitStatus).toBeTruthy()
  })

  it('listWorkspaceFiles lists children of a subdirectory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-subdir-'))
    runGit(dir, ['init'])
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}\n')

    const listed = await listWorkspaceFiles(dir, 'src')
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.entries.map((e) => e.name)).toContain('index.ts')
    expect(listed.entries.every((e) => e.path.startsWith('src/'))).toBe(true)
  })

  it('gitStatus parses branch tracking and rename entries', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-status-parse-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])

    writeFileSync(join(dir, 'old-name.txt'), 'a\n')
    runGit(dir, ['add', 'old-name.txt'])
    runGit(dir, ['commit', '-m', 'init'])
    runGit(dir, ['mv', 'old-name.txt', 'new-name.txt'])

    const status = await gitStatus(dir)
    expect(status.branch).toBeTruthy()
    const renamed = status.entries.find((e) => e.path === 'new-name.txt')
    expect(renamed?.origPath).toBe('old-name.txt')
  })

  it('gitDiff staged mode returns staged diff', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-staged-diff-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1\n')
    runGit(dir, ['add', 'a.ts'])

    const result = await gitDiff(dir, { staged: true, files: ['a.ts'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.diff).toContain('a.ts')
  })

  it('gitLog returns parsed commits', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-log-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])
    writeFileSync(join(dir, 'log.txt'), 'one\n')
    runGit(dir, ['add', 'log.txt'])
    runGit(dir, ['commit', '-m', 'first commit'])

    const rows = await gitLog(dir, 5)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.hash).toBeTruthy()
    expect(rows[0]?.subject).toContain('first commit')
  })

  it('gitAdd and gitCommit succeed for tracked file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-add-commit-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])

    writeFileSync(join(dir, 'commit.txt'), 'v1\n')
    const addResult = await gitAdd(dir, [])
    expect(addResult.ok).toBe(true)

    const commitResult = await gitCommit(dir, 'feat: add commit.txt')
    expect(commitResult.ok).toBe(true)
  })

  it('gitPush reports error for repo without remote', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-push-no-remote-'))
    runGit(dir, ['init'])
    runGit(dir, ['config', 'user.email', 'test@example.com'])
    runGit(dir, ['config', 'user.name', 'Test'])
    writeFileSync(join(dir, 'push.txt'), 'x\n')
    runGit(dir, ['add', 'push.txt'])
    runGit(dir, ['commit', '-m', 'push'])

    const result = await gitPush(dir, {
      setUpstream: true,
      remote: 'origin',
      branch: 'main',
    })
    expect(result.ok).toBe(false)
  })

  it('listWorkspaceFiles returns error for missing directory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-list-missing-'))
    const listed = await listWorkspaceFiles(dir, 'missing/subdir')
    expect(listed.ok).toBe(false)
  })

  it('resolvePathInsideWorkspace rejects empty path', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-empty-path-'))
    const result = resolvePathInsideWorkspace(dir, '   ')
    expect(result.ok).toBe(false)
  })

  it('searchWorkspaceFiles ranks exact base name before broader matches', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-search-workspace-'))
    mkdirSync(join(dir, 'src', 'nested'), { recursive: true })
    writeFileSync(join(dir, 'src', 'file.ts'), 'export {}\n')
    writeFileSync(join(dir, 'src', 'nested', 'other-file.ts'), 'export {}\n')

    const result = await searchWorkspaceFiles(dir, 'file.ts', { limit: 5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paths[0]).toBe('src/file.ts')
    expect(result.paths).toContain('src/nested/other-file.ts')
  })

  it('readWorkspaceFileContent reads text files and rejects binary', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-read-file-'))
    writeFileSync(join(dir, 'hello.txt'), 'hello\nworld\n')
    writeFileSync(join(dir, 'binary.bin'), Buffer.from([0, 1, 2, 3]))

    const text = await readWorkspaceFileContent(dir, 'hello.txt')
    expect(text.ok).toBe(true)
    if (text.ok) expect(text.content).toBe('hello\nworld\n')

    const binary = await readWorkspaceFileContent(dir, 'binary.bin')
    expect(binary.ok).toBe(false)
    if (!binary.ok) expect(binary.binary).toBe(true)
  })

  it('exports editor byte limit constant', () => {
    expect(MAX_WORKSPACE_EDITOR_BYTES).toBe(2 * 1024 * 1024)
  })

  it('readWorkspaceFileContent rejects directories and missing files', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-read-edge-'))
    mkdirSync(join(dir, 'nested'))

    const missing = await readWorkspaceFileContent(dir, 'missing.txt')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toBe('File not found.')

    const directory = await readWorkspaceFileContent(dir, 'nested')
    expect(directory.ok).toBe(false)
    if (!directory.ok) expect(directory.error).toBe('Path is not a file.')
  })

  it('readWorkspaceFileContent rejects files larger than editor limit', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-read-large-'))
    const bigPath = join(dir, 'big.txt')
    writeFileSync(bigPath, Buffer.alloc(2 * 1024 * 1024 + 1))

    const result = await readWorkspaceFileContent(dir, 'big.txt')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('too large to edit')
  })

  it('writeWorkspaceFileContent rejects missing and non-file paths', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-write-edge-'))
    mkdirSync(join(dir, 'nested'))

    const missing = await writeWorkspaceFileContent(dir, 'missing.txt', 'x')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toBe('File not found.')

    const directory = await writeWorkspaceFileContent(dir, 'nested', 'x')
    expect(directory.ok).toBe(false)
    if (!directory.ok) expect(directory.error).toBe('Path is not a file.')
  })

  it('readWorkspaceFileContent rejects paths outside cwd', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-read-escape-'))
    const result = await readWorkspaceFileContent(dir, '../../outside.txt')
    expect(result.ok).toBe(false)
  })

  it('writeWorkspaceFileContent rejects paths outside cwd', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-write-escape-'))
    const result = await writeWorkspaceFileContent(
      dir,
      '../../outside.txt',
      'x',
    )
    expect(result.ok).toBe(false)
  })

  it('writeWorkspaceFileContent updates file content', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-write-file-'))
    writeFileSync(join(dir, 'edit-me.ts'), 'const x = 1\n')

    const written = await writeWorkspaceFileContent(
      dir,
      'edit-me.ts',
      'const x = 2\n',
    )
    expect(written.ok).toBe(true)

    const readBack = await readWorkspaceFileContent(dir, 'edit-me.ts')
    expect(readBack.ok).toBe(true)
    if (readBack.ok) expect(readBack.content).toBe('const x = 2\n')
  })

  it('runWorkspaceTerminalCommand executes in workspace cwd', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-terminal-run-'))
    writeFileSync(join(dir, 'terminal-check.txt'), 'ok\n')

    const result = await runWorkspaceTerminalCommand(
      dir,
      'cat terminal-check.txt',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stdout).toContain('ok')
    expect(result.exitCode).toBe(0)
  })

  it('runWorkspaceTerminalCommand rejects paths outside workspace', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-git-terminal-escape-'))

    const result = await runWorkspaceTerminalCommand(dir, 'pwd', '../')
    expect(result.ok).toBe(false)
  })
})
