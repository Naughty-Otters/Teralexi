import {
  mkdtemp,
  mkdir,
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
  editFiles,
  readFile,
  shell,
  promoteArtifact,
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

  it('editFiles replace applies search/replace with diff metadata', async () => {
    const result = (await editFiles.execute({
      mode: 'replace',
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

  it('exports lean catalog tool metadata', () => {
    expect(readFile.name).toBe('read_file')
    expect(editFiles.name).toBe('edit_files')
    expect(shell.name).toBe('shell')
    expect(promoteArtifact.name).toBe('promote_artifact')
    expect(readFile.needsApproval).toBe(false)
    expect(editFiles.needsApproval).toBe(true)
  })
})
