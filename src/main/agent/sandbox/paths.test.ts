import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertMoveAllowed,
  isPseudoAbsoluteProjectPath,
  isSandboxArtifactRelativePath,
  resolvePathAllowingOutside,
  resolvePathInContext,
  resolveScopedPathInContext,
  resolveUserProjectPath,
} from './paths'

describe('resolvePathInContext', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  afterEach(() => {
    if (sandboxRoot) rmSync(sandboxRoot, { recursive: true, force: true })
    if (workspaceRoot) rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('resolves relative paths in workspace when set', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws-'))
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
    writeFileSync(join(workspaceRoot, 'src', 'index.ts'), 'export {}')

    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, 'src/index.ts'),
    ).toBe(join(workspaceRoot, 'src', 'index.ts'))
    expect(resolvePathInContext(sandboxRoot, workspaceRoot, '.')).toBe(
      workspaceRoot,
    )
  })

  it('routes sandbox artifact relative paths to sandbox', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb2-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws2-'))
    mkdirSync(join(sandboxRoot, 'output', 'results'), { recursive: true })
    writeFileSync(join(sandboxRoot, 'output', 'results', 'cap.txt'), 'ok')

    expect(isSandboxArtifactRelativePath('output/results/cap.txt')).toBe(true)
    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, 'output/results/cap.txt'),
    ).toBe(join(sandboxRoot, 'output', 'results', 'cap.txt'))
  })

  it('routes plans/ to sandbox even when workspace is set', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb-plans-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws-plans-'))
    mkdirSync(join(sandboxRoot, 'plans'), { recursive: true })
    writeFileSync(join(sandboxRoot, 'plans', 'feature.md'), '# plan')

    expect(isSandboxArtifactRelativePath('plans/feature.md')).toBe(true)
    expect(isSandboxArtifactRelativePath('followup/meta.json')).toBe(true)
    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, 'plans/feature.md'),
    ).toBe(join(sandboxRoot, 'plans', 'feature.md'))
    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, 'followup/meta.json'),
    ).toBe(join(sandboxRoot, 'followup', 'meta.json'))
  })

  it('rejects host absolute paths when workspace is not set', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb-nows-'))
    const hostFile = join(tmpdir(), 'outside-ws.txt')
    writeFileSync(hostFile, 'x')
    expect(() =>
      resolvePathInContext(sandboxRoot, null, hostFile),
    ).toThrow(/No workspace folder is bound/)
  })

  it('accepts absolute paths in either root', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb3-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws3-'))
    const wsFile = join(workspaceRoot, 'README.md')
    writeFileSync(wsFile, '# hi')

    expect(resolvePathInContext(sandboxRoot, workspaceRoot, wsFile)).toBe(wsFile)
  })

  it('resolveScopedPathInContext matches resolvePathInContext for workspace files', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb4-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws4-'))
    mkdirSync(join(workspaceRoot, 'lib'), { recursive: true })
    writeFileSync(join(workspaceRoot, 'lib', 'a.ts'), '')

    expect(
      resolveScopedPathInContext(sandboxRoot, workspaceRoot, 'lib/a.ts'),
    ).toBe(join(workspaceRoot, 'lib', 'a.ts'))
  })

  it('treats pseudo-absolute paths like /src/foo.ts as workspace-relative', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb-pseudo-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws-pseudo-'))
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
    writeFileSync(join(workspaceRoot, 'src', 'search.ts'), 'export {}')

    expect(isPseudoAbsoluteProjectPath('/src/search.ts')).toBe(true)
    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, '/src/search.ts'),
    ).toBe(join(workspaceRoot, 'src', 'search.ts'))
    expect(
      resolveUserProjectPath(workspaceRoot, '/src/search.ts'),
    ).toBe(join(workspaceRoot, 'src', 'search.ts'))
  })

  it('strips redundant workspace basename when workspace is a subfolder', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb-srcws-'))
    const repoRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-repo-'))
    workspaceRoot = join(repoRoot, 'src')
    mkdirSync(workspaceRoot, { recursive: true })
    writeFileSync(join(workspaceRoot, 'mcp-server.ts'), 'export {}')

    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, 'src/mcp-server.ts'),
    ).toBe(join(workspaceRoot, 'mcp-server.ts'))
    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, '/src/mcp-server.ts'),
    ).toBe(join(workspaceRoot, 'mcp-server.ts'))
    expect(
      resolveScopedPathInContext(sandboxRoot, workspaceRoot, 'src/mcp-server.ts'),
    ).toBe(join(workspaceRoot, 'mcp-server.ts'))

    rmSync(repoRoot, { recursive: true, force: true })
    workspaceRoot = ''
  })

  it('does not strip src prefix when workspace is repo root', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb-repo-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws-repo-'))
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
    writeFileSync(join(workspaceRoot, 'src', 'mcp-server.ts'), 'export {}')

    expect(
      resolvePathInContext(sandboxRoot, workspaceRoot, 'src/mcp-server.ts'),
    ).toBe(join(workspaceRoot, 'src', 'mcp-server.ts'))
  })
})

describe('resolvePathAllowingOutside', () => {
  let sandboxRoot: string
  let workspaceRoot: string
  let externalRoot: string

  afterEach(() => {
    for (const d of [sandboxRoot, workspaceRoot, externalRoot]) {
      if (d) rmSync(d, { recursive: true, force: true })
    }
  })

  it('allows absolute paths outside both roots', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb5-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws5-'))
    externalRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ext-'))
    const extFile = join(externalRoot, 'outside.txt')
    writeFileSync(extFile, 'x')

    expect(
      resolvePathAllowingOutside(sandboxRoot, extFile, workspaceRoot),
    ).toBe(extFile)
  })
})

describe('assertMoveAllowed', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  afterEach(() => {
    if (sandboxRoot) rmSync(sandboxRoot, { recursive: true, force: true })
    if (workspaceRoot) rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('allows move between workspace and sandbox', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb6-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws6-'))
    const src = join(workspaceRoot, 'a.txt')
    const dest = join(sandboxRoot, 'b.txt')
    writeFileSync(src, 'a')

    expect(() =>
      assertMoveAllowed(sandboxRoot, workspaceRoot, src, dest),
    ).not.toThrow()
  })

  it('blocks move destination outside both roots', () => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-sb7-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'teralexi-paths-ws7-'))
    const src = join(sandboxRoot, 'inside.txt')
    writeFileSync(src, 'x')
    const dest = join(tmpdir(), 'escaped.txt')

    expect(() =>
      assertMoveAllowed(sandboxRoot, workspaceRoot, src, dest),
    ).toThrow(/sandbox or user workspace/)
  })
})
