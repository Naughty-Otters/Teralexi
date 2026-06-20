import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  localSkillIdFromSlug,
  normalizeClawHubSkillFolder,
} from './clawhub-skill-adapter'
import { SKILL_FILES } from '../constants'

describe('clawhub-skill-adapter', () => {
  it('normalizes slug to local skill id', () => {
    expect(localSkillIdFromSlug('my-cool-skill')).toBe('my-cool-skill')
    expect(localSkillIdFromSlug('owner/repo-skill')).toBe('owner-repo-skill')
  })

  it('writes skill body and merges yaml frontmatter into properties.md', () => {
    const folder = mkdtempSync(join(tmpdir(), 'clawhub-adapter-'))
    writeFileSync(
      join(folder, 'SKILL.md'),
      [
        '---',
        'name: Demo Skill',
        'description: Does things',
        'allowed_tools: read_file',
        '---',
        '',
        '# Demo body',
        'Use the full file when no Instructions heading exists.',
      ].join('\n'),
      'utf-8',
    )

    normalizeClawHubSkillFolder({
      skillFolder: folder,
      skillId: 'demo-skill',
      displayName: 'Demo Skill',
      summary: 'Does things',
      defaults: { provider: 'ollama', model: 'gemma4' },
    })

    const skillMd = readFileSync(join(folder, SKILL_FILES.SKILL_MD), 'utf-8')
    expect(skillMd).toContain('# Demo body')
    expect(skillMd).not.toContain('---')

    const properties = readFileSync(join(folder, SKILL_FILES.PROPERTIES_MD), 'utf-8')
    expect(properties).toContain('name: Demo Skill')
    expect(properties).toContain('allowed_tools: read_file')
    expect(properties).toContain('visibility: chat')
    expect(properties).toContain('provider: ollama')
    expect(properties).toContain('model: gemma4')
  })

  it('detects references/ as refs_dir for attachments', () => {
    const folder = mkdtempSync(join(tmpdir(), 'clawhub-adapter-'))
    mkdirSync(join(folder, 'references'), { recursive: true })
    writeFileSync(join(folder, 'SKILL.md'), '# skill\n', 'utf-8')
    writeFileSync(join(folder, 'references', 'guide.md'), '# guide\n', 'utf-8')

    normalizeClawHubSkillFolder({
      skillFolder: folder,
      skillId: 'demo-skill',
      displayName: 'Demo Skill',
      summary: 'Does things',
      defaults: { provider: 'ollama', model: 'gemma4' },
    })

    const properties = readFileSync(join(folder, SKILL_FILES.PROPERTIES_MD), 'utf-8')
    expect(properties).toContain('refs_dir: references')
  })

  it('preserves user properties on update when requested', () => {
    const folder = mkdtempSync(join(tmpdir(), 'clawhub-adapter-'))
    writeFileSync(join(folder, SKILL_FILES.SKILL_MD), '# skill\n', 'utf-8')
    writeFileSync(
      join(folder, SKILL_FILES.PROPERTIES_MD),
      [
        'name: Custom',
        'description: Custom desc',
        'model: custom-model',
        'provider: openai',
        'color: primary',
        'enabled: true',
        'visibility: chat',
      ].join('\n'),
      'utf-8',
    )

    normalizeClawHubSkillFolder({
      skillFolder: folder,
      skillId: 'demo-skill',
      displayName: 'Demo Skill',
      summary: 'Does things',
      defaults: { provider: 'ollama', model: 'gemma4' },
      preserveUserProperties: true,
    })

    const properties = readFileSync(join(folder, SKILL_FILES.PROPERTIES_MD), 'utf-8')
    expect(properties).toContain('model: custom-model')
    expect(properties).toContain('provider: openai')
  })
})
