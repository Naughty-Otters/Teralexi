import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGUAGE_SERVERS } from './language-servers'
import { findWorkspaceSeedFile } from './workspace-seed'

describe('findWorkspaceSeedFile', () => {
  it('prefers known entry points for TypeScript workspaces', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'teralexi-seed-'))
    await mkdir(path.join(root, 'src', 'main'), { recursive: true })
    await writeFile(path.join(root, 'package.json'), '{}', 'utf-8')
    const entry = path.join(root, 'src', 'main', 'index.ts')
    await writeFile(entry, 'export {}', 'utf-8')
    await writeFile(path.join(root, 'other.ts'), 'export {}', 'utf-8')

    const tsServer = LANGUAGE_SERVERS.find((s) => s.id === 'typescript')!
    expect(findWorkspaceSeedFile(root, tsServer)).toBe(entry)
  })

  it('walks the tree when no preferred entry exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'teralexi-seed-walk-'))
    await mkdir(path.join(root, 'lib'), { recursive: true })
    const py = path.join(root, 'lib', 'util.py')
    await writeFile(py, 'def x(): pass', 'utf-8')

    const pyServer = LANGUAGE_SERVERS.find((s) => s.id === 'pyright')!
    expect(findWorkspaceSeedFile(root, pyServer)).toBe(py)
  })
})
