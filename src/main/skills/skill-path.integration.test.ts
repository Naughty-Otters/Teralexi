import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { p } from '@test-paths'
import { SKILL_FILES } from './constants'

let projectRoot = ''
let userSkillsDir = ''
let userToolSetDir = ''

vi.mock('@config/teralexi-home', () => ({
  getTeralexiSkillsDir: () => userSkillsDir,
  getTeralexiToolSetDir: () => userToolSetDir,
  TERALEXI_HOME_DIRNAME: '.teralexi',
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/packaged/app' },
}))

async function seedSkill(
  root: string,
  skillId: string,
  files: Record<string, string> = {},
): Promise<void> {
  const folder = join(root, skillId)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, SKILL_FILES.SKILL_MD), '# skill')
  for (const [rel, body] of Object.entries(files)) {
    const full = join(folder, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body)
  }
}

describe('skill-path integration', () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'skill-path-root-'))
    userSkillsDir = join(projectRoot, '.teralexi', 'skills')
    userToolSetDir = join(projectRoot, '.teralexi', 'toolSet')
    await mkdir(join(projectRoot, 'skills'), { recursive: true })
    await mkdir(join(projectRoot, 'toolSet'), { recursive: true })
    await mkdir(userSkillsDir, { recursive: true })
    await mkdir(userToolSetDir, { recursive: true })
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
  })

  it('resolveSkillsSources and roots order bundled before user', async () => {
    const {
      resolveSkillsSources,
      resolveSkillsSourceRoots,
      resolveToolSetSourceRoots,
    } = await import('./skill-path')
    const sources = resolveSkillsSources()
    expect(sources.bundled).toBe(join(projectRoot, 'skills'))
    expect(sources.user).toBe(userSkillsDir)
    expect(resolveSkillsSourceRoots()).toEqual([
      join(projectRoot, 'skills'),
      userSkillsDir,
    ])
    expect(resolveToolSetSourceRoots()).toEqual([
      join(projectRoot, 'toolSet'),
      userToolSetDir,
    ])
  })

  it('resolveSkillFolder prefers user skill folder', async () => {
    await seedSkill(join(projectRoot, 'skills'), 'demo', {
      'refs/a.md': 'bundled',
    })
    await seedSkill(userSkillsDir, 'demo', { 'refs/a.md': 'user' })
    const { resolveSkillFolder } = await import('./skill-path')
    expect(resolveSkillFolder('demo')).toBe(join(userSkillsDir, 'demo'))
  })

  it('resolveSkillFolder returns null when skill is missing', async () => {
    const { resolveSkillFolder } = await import('./skill-path')
    expect(resolveSkillFolder('missing-skill')).toBeNull()
  })

  it('resolveSkillFolder falls back to bundled', async () => {
    await seedSkill(join(projectRoot, 'skills'), 'bundled-only')
    const { resolveSkillFolder } = await import('./skill-path')
    expect(resolveSkillFolder('bundled-only')).toBe(
      join(projectRoot, 'skills', 'bundled-only'),
    )
  })

  it('resolveLoadableSkillIds merges with user winning order', async () => {
    await seedSkill(join(projectRoot, 'skills'), 'shared')
    await seedSkill(join(projectRoot, 'skills'), 'bundled-only')
    await seedSkill(userSkillsDir, 'shared')
    await seedSkill(userSkillsDir, 'user-only')
    const { resolveLoadableSkillIds } = await import('./skill-path')
    const ids = resolveLoadableSkillIds()
    expect(ids).toContain('shared')
    expect(ids).toContain('bundled-only')
    expect(ids).toContain('user-only')
  })

  it('resolvePropertiesRaw builds default yaml without properties file', async () => {
    const folder = join(projectRoot, 'skills', 'my-skill')
    await seedSkill(join(projectRoot, 'skills'), 'my-skill')
    const { resolvePropertiesRaw } = await import('./skill-path')
    const raw = resolvePropertiesRaw('my-skill', folder, '# body only')
    expect(raw).toContain('My Skill')
    expect(raw).toContain('model:')
  })

  it('resolveSkillsRootDirectory aliases user directory', async () => {
    const { resolveSkillsRootDirectory, resolveUserSkillsDirectory } =
      await import('./skill-path')
    expect(resolveSkillsRootDirectory()).toBe(resolveUserSkillsDirectory())
  })

  it('resolveBundledSkillsDirectory uses unpacked app path when packaged', async () => {
    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getAppPath: () =>
          '/Applications/Teralexi.app/Contents/Resources/app.asar',
      },
    }))
    vi.resetModules()
    const { resolveBundledSkillsDirectory } = await import('./skill-path')
    const unpacked = '/Applications/Teralexi.app/Contents/Resources/app.asar.unpacked/skills'
    expect(p(resolveBundledSkillsDirectory())).toBe(p(unpacked))
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { isPackaged: false, getAppPath: () => '/packaged/app' },
    }))
  })
})
