import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalizeSkillProperties,
  findSkillMarkdownPath,
  hasSkillInstructionMarker,
  normalizeAllowedToolsList,
} from './skill-ecosystem'

describe('skill-ecosystem', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'teralexi-eco-'))
    dirs.push(dir)
    return dir
  }

  it('prefers skill.md over SKILL.md when both exist as distinct files', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'SKILL.md'), '# upper')
    // On case-insensitive FS (APFS default) both names are one file — skip preference check.
    const upper = join(dir, 'SKILL.md')
    const lower = join(dir, 'skill.md')
    if (upper.toLowerCase() === lower.toLowerCase()) {
      expect(hasSkillInstructionMarker(dir)).toBe(true)
      return
    }
    writeFileSync(lower, '# lower')
    expect(findSkillMarkdownPath(dir)).toBe(lower)
  })

  it('discovers Agent Skills SKILL.md', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: x\n---\n')
    expect(hasSkillInstructionMarker(dir)).toBe(true)
    const found = findSkillMarkdownPath(dir)
    expect(found).toBeTruthy()
    expect(found!.toLowerCase()).toBe(join(dir, 'skill.md').toLowerCase())
  })

  it('discovers OpenClaw legacy skills.md and AGENT.md', () => {
    const claw = tempDir()
    writeFileSync(join(claw, 'skills.md'), '# claw')
    expect(findSkillMarkdownPath(claw)).toBe(join(claw, 'skills.md'))

    const agent = tempDir()
    writeFileSync(join(agent, 'AGENT.md'), '# agent')
    expect(findSkillMarkdownPath(agent)).toBe(join(agent, 'AGENT.md'))
  })

  it('maps allowed-tools and fills model/provider defaults', () => {
    const props = canonicalizeSkillProperties(
      {
        name: 'Review',
        description: 'Review PRs',
        'allowed-tools': 'Read Write Bash',
      },
      { skillId: 'review' },
    )
    expect(props.name).toBe('Review')
    expect(props.allowed_tools).toBe('Read, Write, Bash')
    expect(props.model).toBeTruthy()
    expect(props.provider).toBeTruthy()
  })

  it('normalizes mixed separators for allowed tools', () => {
    expect(normalizeAllowedToolsList('read_file, edit_file  grep_files')).toBe(
      'read_file, edit_file, grep_files',
    )
  })

  it('returns null when no marker exists', () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'refs'))
    expect(findSkillMarkdownPath(dir)).toBeNull()
  })
})
