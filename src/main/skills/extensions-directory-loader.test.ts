import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let bundledDir: string
let userDir: string

vi.mock('./skill-path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./skill-path')>()
  return {
    ...actual,
    resolveBundledExtensionsDirectory: () => bundledDir,
    resolveUserExtensionsDirectory: () => userDir,
  }
})

import {
  listExtensions,
  loadExtensionsFromDirectory,
} from './extensions-directory-loader'

async function writeExtension(
  root: string,
  folderName: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const dir = join(root, folderName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'extension.json'), JSON.stringify(manifest))
}

describe('loadExtensionsFromDirectory', () => {
  let extensionsDir: string

  beforeEach(async () => {
    extensionsDir = await mkdtemp(join(tmpdir(), 'extensions-dir-'))
  })

  it('returns an empty array when the directory does not exist', () => {
    expect(loadExtensionsFromDirectory(join(extensionsDir, 'missing'))).toEqual([])
  })

  it('loads a valid extension folder', async () => {
    await writeExtension(extensionsDir, 'secret-guard', {
      id: 'secret-guard',
      version: '1.0.0',
    })
    const result = loadExtensionsFromDirectory(extensionsDir)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('secret-guard')
    expect(result[0].manifest.version).toBe('1.0.0')
  })

  it('skips a folder with no extension.json', async () => {
    await mkdir(join(extensionsDir, 'just-a-skill'), { recursive: true })
    await writeFile(join(extensionsDir, 'just-a-skill', 'skill.md'), '# hi')
    expect(loadExtensionsFromDirectory(extensionsDir)).toEqual([])
  })

  it('skips a folder with an invalid extension.json', async () => {
    await writeExtension(extensionsDir, 'broken', { version: '1.0.0' })
    expect(loadExtensionsFromDirectory(extensionsDir)).toEqual([])
  })

  it('ignores non-directory entries', async () => {
    await writeFile(join(extensionsDir, 'README.md'), '# hi')
    expect(loadExtensionsFromDirectory(extensionsDir)).toEqual([])
  })
})

describe('listExtensions', () => {
  beforeEach(async () => {
    bundledDir = await mkdtemp(join(tmpdir(), 'extensions-bundled-'))
    userDir = await mkdtemp(join(tmpdir(), 'extensions-user-'))
  })

  it('merges bundled and user extensions', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' })
    await writeExtension(userDir, 'matrix-bridge', { id: 'matrix-bridge', version: '0.1.0' })

    const result = listExtensions()
    expect(result.map((e) => e.id).sort()).toEqual(['matrix-bridge', 'secret-guard'])
  })

  it('user extension with the same id overrides the bundled one', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' })
    await writeExtension(userDir, 'secret-guard', { id: 'secret-guard', version: '2.0.0' })

    const result = listExtensions()
    expect(result).toHaveLength(1)
    expect(result[0].manifest.version).toBe('2.0.0')
    expect(result[0].source).toBe('user')
  })
})
