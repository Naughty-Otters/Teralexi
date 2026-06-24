import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'

vi.mock('fs', () => ({ existsSync: vi.fn(() => false), mkdirSync: vi.fn() }))
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
  copyFile: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeSandboxDir: vi.fn(() => '/mock/sandbox-root'),
}))

vi.mock('@main/skills/skill-path', () => ({
  resolveUserSkillsDirectory: vi.fn(() => '/skills'),
  resolveUserToolSetDirectory: vi.fn(() => '/user/toolSet'),
  resolveToolSetSourceRoots: vi.fn(() => ['/bundled/toolSet', '/user/toolSet']),
  resolveSkillFolder: vi.fn((skillId: string) => join('/src-skills', skillId)),
}))


import { existsSync } from 'fs'
import { copyFile, cp, mkdir } from 'fs/promises'
import { referencePathAlreadyInSandbox, Sandbox } from './sandbox-impl'

describe('Sandbox', () => {
  beforeEach(() => {
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(copyFile).mockClear()
  })

  it('builds layout under custom root', () => {
    const sb = new Sandbox({ root: '/tmp/sb' })
    expect(sb.layout.root).toBe('/tmp/sb')
    expect(sb.layout.skillsDir).toBe(join('/tmp/sb', 'skills'))
    expect(sb.layout.outputDir).toBe(join('/tmp/sb', 'output'))
  })

  it('init creates directories once', async () => {
    const sb = new Sandbox({ root: '/tmp/sb2' })
    await sb.init()
    await sb.init()
    expect(mkdir).toHaveBeenCalled()
  })

  it('describe and buildInstructionBlock include paths', () => {
    const sb = new Sandbox({ root: '/tmp/sb3' })
    expect(sb.describe()).toContain('/tmp/sb3')
    expect(sb.buildInstructionBlock()).toContain('/tmp/sb3')
  })

  it('buildInstructionBlock scopes results/scripts per tool-loop step', () => {
    const sb = new Sandbox({ root: '/tmp/sb-scoped' })
    const scope = 'uuid-step-1'
    const block = sb.buildInstructionBlock(scope)
    expect(block).toContain(scope)
    expect(block).toContain(
      join('/tmp/sb-scoped', 'output', 'toolLoop', scope, 'results'),
    )
    expect(block).toContain(
      join('/tmp/sb-scoped', 'output', 'toolLoop', scope, 'scripts'),
    )
    expect(block).toContain(join('/tmp/sb-scoped', 'scripts'))
  })

  it('buildInstructionBlock keeps planning reference scripts at sandbox root when scoped', () => {
    const sb = new Sandbox({ root: '/tmp/sb-scoped-refs' })
    const scopedKey = 'conv:msg::toolLoop:todo-1'
    const block = sb.buildInstructionBlock(scopedKey)
    const stepScripts = join(
      '/tmp/sb-scoped-refs',
      'output',
      'toolLoop',
      'todo-1',
      'scripts',
    )
    const rootScripts = join('/tmp/sb-scoped-refs', 'scripts')
    expect(block).toContain(stepScripts)
    expect(block).toContain(`Reference scripts (copies): ${rootScripts}`)
    expect(block).toContain(
      `${stepScripts} (new files written here)`,
    )
  })

  it('copySkillAssets copies toolSet and skill folder when present', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const sb = new Sandbox({ root: '/tmp/sb4', sourceSkillsDir: '/src-skills' })
    await sb.copySkillAssets('my-skill')
    expect(cp).toHaveBeenCalled()
  })

  it('copyReferenceDoc returns doc unchanged when reference empty', async () => {
    const sb = new Sandbox({ root: '/tmp/sb5' })
    const doc = { reference_url: '' }
    const out = await sb.copyReferenceDoc(doc as never)
    expect(out.reference_url).toBe('')
  })

  it('copyReferenceDoc skips copy when materialized sandbox path already exists', async () => {
    const root = '/tmp/sb5'
    const existing = join(root, 'refs', 'plan.md')
    vi.mocked(existsSync).mockImplementation((p) => String(p) === existing)
    const sb = new Sandbox({ root })
    const out = await sb.copyReferenceDoc({ reference_url: existing } as never)
    expect(out.reference_url).toBe(existing)
    expect(copyFile).not.toHaveBeenCalled()
  })

  it('copyReferenceScript copies when skill-relative path is not at sandbox root', async () => {
    const root = '/tmp/sb6'
    const src = join(root, 'skills', 'my-skill', 'scripts', 'run.sh')
    vi.mocked(existsSync).mockImplementation((p) => String(p) === src)
    const sb = new Sandbox({ root })
    const out = await sb.copyReferenceScript(
      { script_type: 'bash', reference_url: 'scripts/run.sh' } as never,
      'my-skill',
    )
    expect(copyFile).toHaveBeenCalled()
    expect(out.reference_url).not.toBe('scripts/run.sh')
  })

  it('copyReferenceDoc copies when skill-relative path is not at sandbox root', async () => {
    const root = '/tmp/sb7'
    const src = join(root, 'skills', 'my-skill', 'hitl', 'step.form.md')
    vi.mocked(existsSync).mockImplementation((p) => String(p) === src)
    const sb = new Sandbox({ root })
    const out = await sb.copyReferenceDoc(
      { reference_url: 'hitl/step.form.md' } as never,
      'my-skill',
    )
    expect(copyFile).toHaveBeenCalled()
    expect(out.reference_url).not.toBe('hitl/step.form.md')
  })

  it('copyReferenceScript skips copy when materialized script path already exists', async () => {
    const root = '/tmp/sb8'
    const existing = join(root, 'scripts', 'run.sh')
    vi.mocked(existsSync).mockImplementation((p) => String(p) === existing)
    const sb = new Sandbox({ root })
    const out = await sb.copyReferenceScript(
      { script_type: 'bash', reference_url: existing } as never,
    )
    expect(out.reference_url).toBe(existing)
    expect(copyFile).not.toHaveBeenCalled()
  })

  it('copyReferenceDoc still copies when path exists outside sandbox root', async () => {
    const root = '/tmp/sb9'
    const outside = '/other/skills/plan.md'
    const src = join(root, 'skills', 'my-skill', 'plan.md')
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      return s === outside || s === src
    })
    const sb = new Sandbox({ root })
    const out = await sb.copyReferenceDoc(
      { reference_url: outside } as never,
      'my-skill',
    )
    expect(copyFile).toHaveBeenCalled()
    expect(out.reference_url).toBe(join(root, 'refs', 'plan.md'))
  })
})

describe('referencePathAlreadyInSandbox', () => {
  const layout = {
    root: '/tmp/sandbox',
    skillsDir: '/tmp/sandbox/skills',
    refsDir: '/tmp/sandbox/refs',
    scriptsDir: '/tmp/sandbox/scripts',
    outputDir: '/tmp/sandbox/output',
  }

  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false)
  })

  it('returns false for empty or remote URLs', () => {
    expect(referencePathAlreadyInSandbox('', layout)).toBe(false)
    expect(referencePathAlreadyInSandbox('https://example.com/a.md', layout)).toBe(
      false,
    )
  })

  it('returns false for relative paths under sandbox root when file is missing', () => {
    expect(referencePathAlreadyInSandbox('scripts/run.sh', layout)).toBe(false)
    expect(referencePathAlreadyInSandbox('refs/plan.md', layout)).toBe(false)
  })

  it('returns true when resolved path exists under sandbox root', () => {
    const materialized = join(layout.root, 'refs', 'plan.md')
    vi.mocked(existsSync).mockImplementation((p) => String(p) === materialized)
    expect(referencePathAlreadyInSandbox(materialized, layout)).toBe(true)
    expect(referencePathAlreadyInSandbox('refs/plan.md', layout)).toBe(true)
  })

  it('returns false when file exists only under skills mirror, not at resolved root path', () => {
    const skillOnly = join(layout.skillsDir, 'my-skill', 'scripts', 'run.sh')
    vi.mocked(existsSync).mockImplementation((p) => String(p) === skillOnly)
    expect(referencePathAlreadyInSandbox('scripts/run.sh', layout)).toBe(false)
  })

  it('returns false for absolute paths outside the sandbox even when they exist', () => {
    const outside = '/other/plan.md'
    vi.mocked(existsSync).mockImplementation((p) => String(p) === outside)
    expect(referencePathAlreadyInSandbox(outside, layout)).toBe(false)
  })
})
