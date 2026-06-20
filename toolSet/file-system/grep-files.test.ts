import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  OTTER_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from '../sandbox-paths'

const { runRipgrepJsonMock } = vi.hoisted(() => ({
  runRipgrepJsonMock: vi.fn(),
}))

vi.mock('./ripgrep', () => ({
  runRipgrepJson: runRipgrepJsonMock,
}))

import { grepFiles } from './grep-files'
import { MAX_GREP_MATCHES } from './constants'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_WORKSPACE_PATH_ENV]
  }
}

describe('grep-files tool', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    runRipgrepJsonMock.mockReset()
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-grep-sb-'))
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'openfde-grep-ws-'))
    await mkdir(path.join(workspaceRoot, 'src'), { recursive: true })
    await writeFile(path.join(workspaceRoot, 'src', 'a.ts'), 'const needle = 1\n', 'utf-8')
    await writeFile(path.join(workspaceRoot, 'src', 'b.txt'), 'no match\n', 'utf-8')
    setSandboxRoot(sandboxRoot)
    setWorkspaceRoot(workspaceRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('requires an active sandbox', async () => {
    setSandboxRoot(undefined)
    await expect(grepFiles.execute({ pattern: 'needle' })).resolves.toMatchObject({
      error: expect.stringContaining('sandbox'),
    })
  })

  it('rejects empty pattern', async () => {
    await expect(grepFiles.execute({ pattern: '   ' })).resolves.toMatchObject({
      error: expect.stringContaining('Invalid pattern'),
    })
  })

  it('returns ripgrep matches when available', async () => {
    runRipgrepJsonMock.mockResolvedValue({
      available: true,
      matches: [{ path: 'src/a.ts', lineNumber: 1, line: 'const needle = 1' }],
    })

    const result = await grepFiles.execute({ pattern: 'needle', path: '.' })
    expect(result).toMatchObject({
      pattern: 'needle',
      matchCount: 1,
      matches: expect.stringContaining(`${path.join(workspaceRoot, 'src', 'a.ts')}:1:`),
    })
    expect(runRipgrepJsonMock).toHaveBeenCalledWith(
      expect.arrayContaining(['--no-heading', 'needle', '-g', '!**/node_modules/**']),
      workspaceRoot,
    )
  })

  it('greps a single file when path points to a file', async () => {
    const filePath = path.join(workspaceRoot, 'src', 'a.ts')
    runRipgrepJsonMock.mockResolvedValue({
      available: true,
      matches: [{ path: filePath, lineNumber: 1, line: 'const needle = 1' }],
    })

    const result = await grepFiles.execute({ pattern: 'needle', path: 'src/a.ts' })
    expect(result).toMatchObject({
      matchCount: 1,
      matches: expect.stringContaining(`${filePath}:1:`),
    })
    expect(runRipgrepJsonMock).toHaveBeenCalledWith(
      expect.arrayContaining(['--no-heading', 'needle', filePath]),
      path.join(workspaceRoot, 'src'),
    )
  })

  it('shows match paths relative to workspace root when searching a subfolder', async () => {
    runRipgrepJsonMock.mockResolvedValue({
      available: true,
      matches: [{ path: 'a.ts', lineNumber: 1, line: 'const needle = 1' }],
    })

    const result = await grepFiles.execute({ pattern: 'needle', path: 'src' })
    expect(result).toMatchObject({
      matchCount: 1,
      matches: expect.stringContaining(`${path.join(workspaceRoot, 'src', 'a.ts')}:1:`),
    })
    expect(runRipgrepJsonMock).toHaveBeenCalledWith(
      expect.arrayContaining(['--no-heading', 'needle']),
      path.join(workspaceRoot, 'src'),
    )
  })

  it('passes include glob to ripgrep', async () => {
    runRipgrepJsonMock.mockResolvedValue({ available: true, matches: [] })
    await grepFiles.execute({ pattern: 'needle', include: '*.ts' })
    expect(runRipgrepJsonMock).toHaveBeenCalledWith(
      expect.arrayContaining(['--no-heading', 'needle', '-g', '*.ts']),
      expect.any(String),
    )
  })

  it('excludes node_modules and hidden files by default in node fallback', async () => {
    runRipgrepJsonMock.mockResolvedValue({
      available: false,
      matches: [],
      error: 'rg missing',
    })
    await mkdir(path.join(workspaceRoot, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(
      path.join(workspaceRoot, 'node_modules', 'pkg', 'index.js'),
      'needle\n',
      'utf-8',
    )
    await writeFile(path.join(workspaceRoot, '.hidden.ts'), 'needle\n', 'utf-8')

    const result = await grepFiles.execute({ pattern: 'needle', path: '.' })
    expect(result).toMatchObject({ matchCount: 1 })
    expect(result).toMatchObject({
      matches: expect.stringContaining(`${path.join(workspaceRoot, 'src', 'a.ts')}:1:`),
    })
    expect(String(result.matches)).not.toContain('node_modules')
    expect(String(result.matches)).not.toContain('.hidden.ts')
  })

  it('falls back to node scan when ripgrep is unavailable', async () => {
    runRipgrepJsonMock.mockResolvedValue({
      available: false,
      matches: [],
      error: 'rg missing',
    })

    const result = await grepFiles.execute({ pattern: 'needle', path: '.' })
    expect(result).toMatchObject({
      matchCount: 1,
      matches: expect.stringContaining(`${path.join(workspaceRoot, 'src', 'a.ts')}:1:`),
      note: expect.stringContaining('Node fallback'),
    })
  })

  it('truncates results at MAX_GREP_MATCHES', async () => {
    const many = Array.from({ length: MAX_GREP_MATCHES + 5 }, (_, i) => ({
      path: `src/f${i}.ts`,
      lineNumber: 1,
      line: 'needle',
    }))
    runRipgrepJsonMock.mockResolvedValue({ available: true, matches: many })

    const result = await grepFiles.execute({ pattern: 'needle' })
    expect(result).toMatchObject({
      matchCount: MAX_GREP_MATCHES,
      note: expect.stringContaining(`truncated at ${MAX_GREP_MATCHES}`),
    })
  })

  it('returns error for invalid regex in node fallback', async () => {
    runRipgrepJsonMock.mockResolvedValue({ available: false, matches: [] })
    const result = await grepFiles.execute({ pattern: '[invalid' })
    expect(result).toMatchObject({ error: expect.stringContaining('Invalid regex') })
  })
})
