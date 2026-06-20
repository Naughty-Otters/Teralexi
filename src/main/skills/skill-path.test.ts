import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeSkillsDir: vi.fn(() => '/mock/.openfde/skills'),
  getopenfdeToolSetDir: vi.fn(() => '/mock/.openfde/toolSet'),
}))

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import {
  extractYamlFrontmatterBlock,
  getHostToolOs,
  isLoadableSkillFolder,
  isReservedSkillDirName,
  resolveBundledSkillsDirectory,
  mergePropertiesRaw,
  resolvePropertiesRaw,
  resolveSkillsSourceRoots,
  resolveSkillFolder,
  resolveBundledToolSetDirectory,
  resolveToolSetSourceRoots,
  resolveUserSkillsDirectory,
  resolveUserToolSetDirectory,
  stripYamlFrontmatter,
} from './skill-path'
import { SKILL_FILES } from './constants'

describe('skill-path', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(readdirSync).mockReset()
    vi.mocked(statSync).mockReset()
  })

  it('maps host OS', () => {
    const os = getHostToolOs()
    if (process.platform === 'darwin') expect(os).toBe('mac')
    else if (process.platform === 'win32') expect(os).toBe('win')
    else expect(os).toBe('linux')
  })

  it('detects reserved directories', () => {
    expect(isReservedSkillDirName('.hidden')).toBe(true)
    expect(isReservedSkillDirName('my-skill')).toBe(false)
  })

  it('isLoadableSkillFolder requires directory with skill.md', () => {
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never)
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith(SKILL_FILES.SKILL_MD),
    )
    expect(isLoadableSkillFolder('/skills', 'demo')).toBe(true)
    vi.mocked(statSync).mockImplementation(() => {
      throw new Error('missing')
    })
    expect(isLoadableSkillFolder('/skills', 'bad')).toBe(false)
  })

  it('extracts and strips yaml frontmatter', () => {
    const md = '---\nname: X\n---\nBody'
    expect(extractYamlFrontmatterBlock(md)).toContain('name: X')
    expect(stripYamlFrontmatter(md)).toBe('Body')
  })

  it('mergePropertiesRaw lets properties.md override skill frontmatter', () => {
    const merged = mergePropertiesRaw(
      'name: FromSkill\nmodel: a\nprovider: ollama',
      'name: FromFile\nmodel: b',
    )
    expect(merged).toContain('name: FromFile')
    expect(merged).toContain('model: b')
    expect(merged).toContain('provider: ollama')
  })

  it('resolvePropertiesRaw merges skill frontmatter with properties.md', () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith(SKILL_FILES.PROPERTIES_MD),
    )
    vi.mocked(readFileSync).mockReturnValue('model: override-model')
    const raw = resolvePropertiesRaw(
      'demo',
      '/skills/demo',
      '---\nname: FromSkill\nprovider: ollama\n---\n# body',
    )
    expect(raw).toContain('name: FromSkill')
    expect(raw).toContain('model: override-model')
    expect(raw).toContain('provider: ollama')
  })

  it('resolveSkillsSourceRoots returns bundled then user', () => {
    expect(resolveSkillsSourceRoots()).toEqual([
      resolveBundledSkillsDirectory(),
      resolveUserSkillsDirectory(),
    ])
  })

  it('resolveToolSetSourceRoots lists bundled then user toolSet dirs', () => {
    expect(resolveToolSetSourceRoots()).toEqual([
      resolveBundledToolSetDirectory(),
      resolveUserToolSetDirectory(),
    ])
  })

  it('resolveSkillFolder prefers user skill over bundled', () => {
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never)
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith(SKILL_FILES.SKILL_MD)) {
        return s.includes('/mock/.openfde/skills/demo/')
      }
      return false
    })
    expect(resolveSkillFolder('demo')).toBe(join('/mock/.openfde/skills', 'demo'))
  })
})
