import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  findExtensionRoot,
  findSkillRoot,
  hasExtensionMarker,
  hasSkillMarker,
  normalizeInstalledSkill,
  parseGithubSource,
} from './install.js'

const dirs = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'teralexi-cli-test-'))
  dirs.push(dir)
  return dir
}

after(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseGithubSource', () => {
  it('parses owner/repo shorthand', () => {
    const parsed = parseGithubSource('acme/demo-skill')
    assert.equal(parsed?.kind, 'git')
    assert.equal(parsed?.cloneUrl, 'https://github.com/acme/demo-skill.git')
    assert.equal(parsed?.defaultId, 'demo-skill')
  })

  it('parses GitHub tree URLs with subpath', () => {
    const parsed = parseGithubSource(
      'https://github.com/acme/repo/tree/main/skills/foo',
    )
    assert.equal(parsed?.kind, 'git')
    assert.equal(parsed?.subPath, 'skills/foo')
    assert.equal(parsed?.defaultId, 'foo')
  })

  it('parses local paths', () => {
    const dir = tempDir()
    const parsed = parseGithubSource(dir)
    assert.equal(parsed?.kind, 'local')
    assert.equal(parsed?.path, dir)
  })
})

describe('skill/extension root detection', () => {
  it('finds SKILL.md and extension.json roots', () => {
    const root = tempDir()
    const skill = join(root, 'skills', 'demo')
    mkdirSync(skill, { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: demo\n---\nBody\n')
    assert.equal(hasSkillMarker(skill), true)
    assert.equal(findSkillRoot(root), skill)

    const ext = join(root, 'extensions', 'guard')
    mkdirSync(ext, { recursive: true })
    writeFileSync(
      join(ext, 'extension.json'),
      JSON.stringify({ id: 'guard', name: 'Guard', version: '0.0.1' }),
    )
    assert.equal(hasExtensionMarker(ext), true)
    assert.equal(findExtensionRoot(root), ext)
  })
})

describe('normalizeInstalledSkill', () => {
  it('writes skill.md + properties.md from Agent Skills SKILL.md', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'SKILL.md'),
      '---\nname: Review\ndescription: Review PRs\nallowed-tools: Read Write\n---\nDo review.\n',
    )
    normalizeInstalledSkill(dir, 'review')
    const props = readFileSync(join(dir, 'properties.md'), 'utf8')
    assert.match(props, /name: Review/)
    assert.match(props, /allowed_tools: Read, Write/)
    assert.match(props, /model: /)
    assert.match(props, /provider: /)
    const body = readFileSync(join(dir, 'skill.md'), 'utf8')
    assert.match(body, /Do review/)
  })
})
