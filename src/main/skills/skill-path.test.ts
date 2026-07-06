import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { mockTeralexiDir, pathsEqual } from '@test-paths'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

vi.mock('@config/teralexi-home', () => ({
  getTeralexiSkillsDir: vi.fn(() => mockTeralexiDir('skills')),
  getTeralexiToolSetDir: vi.fn(() => mockTeralexiDir('toolSet')),
}))

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import {
  extractYamlFrontmatterBlock,
  getHostToolOs,
  isLoadableSkillFolder,
  isReservedSkillDirName,
  resolveBundledSkillsDirectory,
  mergePropertiesRaw,
  parsePropertiesKeyValues,
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

  it('parsePropertiesKeyValues accepts CRLF property files', () => {
    const raw = 'name: Research\r\nmodel: gemma4\r\nprovider: ollama\r\n'
    expect(parsePropertiesKeyValues(raw)).toEqual({
      name: 'Research',
      model: 'gemma4',
      provider: 'ollama',
    })
  })

  it('normalizeSkillFileText strips BOM and CR-only line endings', () => {
    const raw = '\uFEFFname: Demo\rmodel: x\r\nprovider: ollama\n'
    expect(parsePropertiesKeyValues(raw)).toEqual({
      name: 'Demo',
      model: 'x',
      provider: 'ollama',
    })
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
    const userSkillMd = join(mockTeralexiDir('skills', 'demo'), SKILL_FILES.SKILL_MD)
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never)
    vi.mocked(existsSync).mockImplementation((target) =>
      pathsEqual(String(target), userSkillMd),
    )
    expect(resolveSkillFolder('demo')).toBe(join(mockTeralexiDir('skills'), 'demo'))
  })
})
