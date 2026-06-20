import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectWorkspaceServers,
  initBundledLspBin,
  isLspSupportedFile,
  matchLanguageServer,
  OTTER_LSP_BUNDLED_BIN_ENV,
  resolveServerCommand,
  LANGUAGE_SERVERS,
} from './language-servers'

const tsServer = LANGUAGE_SERVERS.find((s) => s.id === 'typescript')!

describe('matchLanguageServer', () => {
  it('maps TypeScript/React extensions to the typescript server + languageId', () => {
    expect(matchLanguageServer('/ws/src/a.ts')).toMatchObject({
      server: { id: 'typescript' },
      languageId: 'typescript',
    })
    expect(matchLanguageServer('/ws/src/a.tsx')?.languageId).toBe('typescriptreact')
    expect(matchLanguageServer('/ws/src/a.jsx')?.languageId).toBe('javascriptreact')
  })

  it('maps python, go, and rust', () => {
    expect(matchLanguageServer('/ws/m.py')).toMatchObject({ server: { id: 'pyright' }, languageId: 'python' })
    expect(matchLanguageServer('/ws/m.go')).toMatchObject({ server: { id: 'gopls' }, languageId: 'go' })
    expect(matchLanguageServer('/ws/m.rs')).toMatchObject({ server: { id: 'rust-analyzer' }, languageId: 'rust' })
  })

  it('is case-insensitive on the extension', () => {
    expect(matchLanguageServer('/ws/A.TS')?.languageId).toBe('typescript')
  })

  it('returns null for unknown or extension-less files', () => {
    expect(matchLanguageServer('/ws/readme.md')).toBeNull()
    expect(matchLanguageServer('/ws/Makefile')).toBeNull()
    expect(matchLanguageServer('')).toBeNull()
  })
})

describe('isLspSupportedFile', () => {
  it('reflects matchLanguageServer', () => {
    expect(isLspSupportedFile('/ws/a.ts')).toBe(true)
    expect(isLspSupportedFile('/ws/a.txt')).toBe(false)
  })
})

describe('resolveServerCommand', () => {
  let dir: string
  const savedEnv = process.env[OTTER_LSP_BUNDLED_BIN_ENV]
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    if (savedEnv === undefined) delete process.env[OTTER_LSP_BUNDLED_BIN_ENV]
    else process.env[OTTER_LSP_BUNDLED_BIN_ENV] = savedEnv
  })

  it('prefers a project-local node_modules/.bin install', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-bin-'))
    const binDir = join(dir, 'node_modules', '.bin')
    mkdirSync(binDir, { recursive: true })
    const localBin = join(binDir, 'typescript-language-server')
    writeFileSync(localBin, '#!/usr/bin/env node\n')
    expect(resolveServerCommand(tsServer, dir)).toBe(localBin)
  })

  it('falls back to the app-bundled bin when no project-local install exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-bundled-'))
    const bundledBin = join(dir, '.bin')
    mkdirSync(bundledBin, { recursive: true })
    const server = join(bundledBin, 'typescript-language-server')
    writeFileSync(server, '#!/usr/bin/env node\n')
    process.env[OTTER_LSP_BUNDLED_BIN_ENV] = bundledBin

    // workspace has no local install → resolves to the bundled one
    const ws = join(dir, 'empty-workspace')
    mkdirSync(ws, { recursive: true })
    expect(resolveServerCommand(tsServer, ws)).toBe(server)
  })

  it('project-local takes precedence over the app-bundled bin', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-prec-'))
    const bundledBin = join(dir, 'bundled', '.bin')
    mkdirSync(bundledBin, { recursive: true })
    writeFileSync(join(bundledBin, 'typescript-language-server'), 'x')
    process.env[OTTER_LSP_BUNDLED_BIN_ENV] = bundledBin

    const ws = join(dir, 'ws')
    const localBinDir = join(ws, 'node_modules', '.bin')
    mkdirSync(localBinDir, { recursive: true })
    const localBin = join(localBinDir, 'typescript-language-server')
    writeFileSync(localBin, 'x')
    expect(resolveServerCommand(tsServer, ws)).toBe(localBin)
  })

  it('falls back to the bare command when nothing is installed', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-nobin-'))
    delete process.env[OTTER_LSP_BUNDLED_BIN_ENV]
    expect(resolveServerCommand(tsServer, dir)).toBe('typescript-language-server')
  })
})

describe('initBundledLspBin', () => {
  let dir: string
  const savedEnv = process.env[OTTER_LSP_BUNDLED_BIN_ENV]
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    if (savedEnv === undefined) delete process.env[OTTER_LSP_BUNDLED_BIN_ENV]
    else process.env[OTTER_LSP_BUNDLED_BIN_ENV] = savedEnv
  })

  it('publishes the first candidate root that has node_modules/.bin', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-init-'))
    const good = join(dir, 'good')
    mkdirSync(join(good, 'node_modules', '.bin'), { recursive: true })
    const result = initBundledLspBin([join(dir, 'missing'), good])
    expect(result).toBe(join(good, 'node_modules', '.bin'))
    expect(process.env[OTTER_LSP_BUNDLED_BIN_ENV]).toBe(result)
  })

  it('returns null when no candidate has node_modules/.bin', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-init-none-'))
    delete process.env[OTTER_LSP_BUNDLED_BIN_ENV]
    expect(initBundledLspBin([join(dir, 'a'), join(dir, 'b')])).toBeNull()
  })
})

describe('detectWorkspaceServers', () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('detects typescript via tsconfig/package.json and nothing for a bare dir', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-detect-'))
    expect(detectWorkspaceServers(dir)).toEqual([])
    writeFileSync(join(dir, 'package.json'), '{}')
    expect(detectWorkspaceServers(dir).map((s) => s.id)).toContain('typescript')
  })

  it('detects multiple ecosystems by their markers', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-lsp-multi-'))
    writeFileSync(join(dir, 'tsconfig.json'), '{}')
    writeFileSync(join(dir, 'go.mod'), 'module x\n')
    const ids = detectWorkspaceServers(dir).map((s) => s.id)
    expect(ids).toContain('typescript')
    expect(ids).toContain('gopls')
    expect(ids).not.toContain('rust-analyzer')
  })

  it('returns [] for an empty path', () => {
    expect(detectWorkspaceServers('')).toEqual([])
  })
})
