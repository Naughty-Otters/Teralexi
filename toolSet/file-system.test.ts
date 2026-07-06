import {
  mkdtemp,
  mkdir,
  readFile as readFileFs,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from './sandbox-paths'
import {
  copyFile as copyFileTool,
  editFile,
  fileStatus,
  globFiles,
  grepFiles,
  listFiles,
  moveFile,
  readFile,
  searchFiles,
  storageCheck,
  writeFile as writeFileTool,
  applyPatch,
} from './file-system'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
  }
}

describe('file-system tools', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-fs-test-'))
    await writeFile(path.join(sandboxRoot, 'hello.txt'), 'hello world', 'utf-8')
    await mkdir(path.join(sandboxRoot, 'subdir'), { recursive: true })
    await writeFile(path.join(sandboxRoot, 'subdir', 'nested.txt'), 'nested', 'utf-8')
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('listFiles returns error when sandbox inactive', async () => {
    setSandboxRoot(undefined)
    const result = await listFiles.execute({ path: '.' })
    expect(result).toMatchObject({ error: expect.stringContaining('sandbox') })
  })

  it('listFiles lists sandbox directory', async () => {
    const result = (await listFiles.execute({ path: '.' })) as {
      entries: Array<{ name: string }>
    }
    expect(result.entries.map((e) => e.name)).toContain('hello.txt')
  })

  it('listFiles supports recursive listing', async () => {
    const result = (await listFiles.execute({
      path: '.',
      recursive: true,
      maxDepth: 2,
    })) as { entries: Array<{ name: string; children?: unknown[] }> }
    const sub = result.entries.find((e) => e.name === 'subdir')
    expect(sub?.children).toBeDefined()
  })

  it('searchFiles finds by name and content', async () => {
    const byName = (await searchFiles.execute({
      path: '.',
      query: 'hello',
    })) as { results: Array<{ match: string }> }
    expect(byName.results.some((r) => r.match === 'name')).toBe(true)

    const byContent = (await searchFiles.execute({
      path: '.',
      query: 'nested',
      matchContent: true,
    })) as { results: Array<{ match: string }> }
    expect(byContent.results.some((r) => r.match === 'content')).toBe(true)
  })

  it('fileStatus returns metadata', async () => {
    const result = (await fileStatus.execute({ path: 'hello.txt' })) as {
      isFile: boolean
      size: number
    }
    expect(result.isFile).toBe(true)
    expect(result.size).toBeGreaterThan(0)
  })

  it('storageCheck returns df stats or a posix fallback note', async () => {
    const result = (await storageCheck.execute({})) as {
      data?: Array<{ available: number }>
      error?: string
      note?: string
    }
    if (Array.isArray(result.data) && result.data.length > 0) {
      expect(result.data[0]?.available).toBeGreaterThanOrEqual(0)
    } else {
      expect(result.error ?? result.note).toBeTruthy()
    }
  })

  it('writeFile and readFile round-trip', async () => {
    const wrote = await writeFileTool.execute({
      path: 'out/new.txt',
      data: 'payload',
    })
    expect(wrote).toMatchObject({ written: true })

    const read = (await readFile.execute({ path: 'out/new.txt' })) as {
      content: string
    }
    expect(read.content).toBe('1: payload')
  })

  it('copyFile copies inside sandbox', async () => {
    const result = await copyFileTool.execute({
      source: 'hello.txt',
      destination: 'hello-copy.txt',
    })
    expect(result).toMatchObject({ copied: true })
    const copy = await readFileFs(path.join(sandboxRoot, 'hello-copy.txt'), 'utf-8')
    expect(copy).toBe('hello world')
  })

  it('moveFile moves inside sandbox', async () => {
    await writeFile(path.join(sandboxRoot, 'move-me.txt'), 'mv', 'utf-8')
    const result = await moveFile.execute({
      source: 'move-me.txt',
      destination: 'moved.txt',
    })
    expect(result).toMatchObject({ moved: true })
    await expect(
      readFileFs(path.join(sandboxRoot, 'move-me.txt'), 'utf-8'),
    ).rejects.toThrow()
    expect(await readFileFs(path.join(sandboxRoot, 'moved.txt'), 'utf-8')).toBe(
      'mv',
    )
  })

  it('readFile lists directories', async () => {
    const result = (await readFile.execute({ path: 'subdir' })) as {
      isDirectory: boolean
      entries: string[]
    }
    expect(result.isDirectory).toBe(true)
    expect(result.entries).toContain('nested.txt')
  })

  it('readFile reports missing files', async () => {
    const result = await readFile.execute({ path: 'missing.txt' })
    expect(result).toMatchObject({ error: expect.stringContaining('not found') })
  })

  it('rejects path escape on read', async () => {
    const result = await readFile.execute({ path: '/etc/passwd' })
    expect(result).toMatchObject({ error: expect.stringContaining('sandbox') })
  })

  it('readFile returns line-numbered content with offset', async () => {
    await writeFile(path.join(sandboxRoot, 'lines.txt'), 'a\nb\nc\n', 'utf-8')
    const result = (await readFile.execute({
      path: 'lines.txt',
      offset: 2,
      limit: 1,
    })) as { content: string }
    expect(result.content).toBe('2: b')
  })

  it('editFile applies search/replace with diff metadata', async () => {
    const result = (await editFile.execute({
      path: 'hello.txt',
      old_string: 'world',
      new_string: 'otter',
    })) as { written: boolean; diff: string; additions: number; deletions: number }
    expect(result.written).toBe(true)
    expect(result.diff).toContain('-hello world')
    expect(result.diff).toContain('+hello otter')
    expect(result.additions).toBeGreaterThan(0)

    const read = (await readFile.execute({ path: 'hello.txt' })) as { content: string }
    expect(read.content).toContain('hello otter')
  })

  it('writeFile returns diff metadata on overwrite', async () => {
    const result = (await writeFileTool.execute({
      path: 'hello.txt',
      data: 'replaced',
      overwrite: true,
    })) as { diff: string; additions: number; deletions: number }
    expect(result.diff).toBeTruthy()
    expect(result.additions + result.deletions).toBeGreaterThan(0)
  })

  it('grepFiles finds content', async () => {
    const result = (await grepFiles.execute({
      path: '.',
      pattern: 'nested',
    })) as { matchCount: number; matches: string }
    expect(result.matchCount).toBeGreaterThan(0)
    expect(result.matches).toContain('nested')
  })

  it('globFiles finds files by pattern', async () => {
    const result = (await globFiles.execute({
      path: '.',
      pattern: '*.txt',
    })) as { count: number; paths: string[] }
    expect(result.count).toBeGreaterThan(0)
    expect(result.paths.some((p) => p.endsWith('hello.txt'))).toBe(true)
  })

  it('applyPatch adds a file', async () => {
    const result = await applyPatch.execute({
      patch_text: `*** Begin Patch
*** Add File: patched.txt
+patched content
*** End Patch`,
    })
    expect(result).toMatchObject({ applied: true })
    const read = (await readFile.execute({ path: 'patched.txt' })) as { content: string }
    expect(read.content).toContain('patched content')
  })

  it('exports tool metadata', () => {
    expect(listFiles.name).toBe('list_files')
    expect(readFile.needsApproval).toBe(false)
    expect(moveFile.needsApproval).toBe(true)
    expect(editFile.needsApproval).toBe(true)
    expect(grepFiles.name).toBe('grep_files')
  })
})
