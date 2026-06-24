import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_FILES } from './constants'

vi.mock('./bundled-skills-manifest', () => ({
  isBundledSkillId: vi.fn(() => false),
  getBundledSkillSource: vi.fn(() => null),
}))

import {
  DEFAULT_SKILL_ATTACHMENT_DIRS,
  normalizeAttachmentDir,
  parseAttachmentDirList,
  parseAttachmentDirsFromProperties,
  referenceUrlLooksLikeForm,
  resolveFormAttachmentDirsForSkill,
  resolveSkillAttachmentDirs,
  splitAttachmentDirPropertyValue,
} from './skill-attachment-dirs'

let bundledRoot = ''
let userRoot = ''

vi.mock('./skill-path', () => ({
  resolveSkillFolder: vi.fn((skillId: string) => {
    const id = skillId.trim()
    const user = join(userRoot, id)
    const bundled = join(bundledRoot, id)
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    if (existsSync(join(user, SKILL_FILES.SKILL_MD))) return user
    if (existsSync(join(bundled, SKILL_FILES.SKILL_MD))) return bundled
    return null
  }),
  resolveUserSkillsDirectory: vi.fn(() => userRoot),
  isLoadableSkillFolder: vi.fn((skillsDir: string, skillId: string) => {
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    return existsSync(join(skillsDir, skillId, SKILL_FILES.SKILL_MD))
  }),
}))

async function seedSkill(
  root: string,
  skillId: string,
  files: Record<string, string>,
): Promise<void> {
  const base = join(root, skillId)
  await mkdir(base, { recursive: true })
  await writeFile(join(base, SKILL_FILES.SKILL_MD), '# skill')
  for (const [rel, body] of Object.entries(files)) {
    const full = join(base, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, body)
  }
}

describe('splitAttachmentDirPropertyValue', () => {
  it('splits comma-separated paths', () => {
    expect(splitAttachmentDirPropertyValue('refs, docs, assets/refs')).toEqual([
      'refs',
      'docs',
      'assets/refs',
    ])
  })
})

describe('parseAttachmentDirList', () => {
  it('returns fallback when empty', () => {
    expect(parseAttachmentDirList(undefined, 'refs')).toEqual(['refs'])
  })

  it('dedupes and skips invalid entries', () => {
    expect(
      parseAttachmentDirList('docs, toolSet, docs, ../bad, library', 'refs'),
    ).toEqual(['docs', 'library'])
  })
})

describe('normalizeAttachmentDir', () => {
  it('returns fallback for empty or unsafe values', () => {
    expect(normalizeAttachmentDir('', 'refs')).toBe('refs')
    expect(normalizeAttachmentDir('../evil', 'refs')).toBe('refs')
    expect(normalizeAttachmentDir('toolSet', 'refs')).toBe('refs')
  })

  it('allows nested relative paths', () => {
    expect(normalizeAttachmentDir('assets/refs', 'refs')).toBe('assets/refs')
  })
})

describe('parseAttachmentDirsFromProperties', () => {
  it('uses defaults when keys are missing', () => {
    expect(parseAttachmentDirsFromProperties('name: X\nmodel: m\nprovider: ollama')).toEqual(
      DEFAULT_SKILL_ATTACHMENT_DIRS,
    )
  })

  it('reads single custom dir per category', () => {
    const dirs = parseAttachmentDirsFromProperties(`
name: Custom
refs_dir: docs
scripts_dir: bin
form_dir: hitl
model: gemma4
provider: ollama
`)
    expect(dirs).toEqual({
      ref: ['docs'],
      script: ['bin'],
      form: ['hitl'],
    })
  })

  it('reads multiple comma-separated dirs per category', () => {
    const dirs = parseAttachmentDirsFromProperties(`
refs_dir: refs, docs, shared/refs
scripts_dir: scripts, bin
form_dir: form, hitl
`)
    expect(dirs).toEqual({
      ref: ['refs', 'docs', 'shared/refs'],
      script: ['scripts', 'bin'],
      form: ['form', 'hitl'],
    })
  })

  it('falls back per key when all values are invalid', () => {
    const dirs = parseAttachmentDirsFromProperties(`
refs_dir: toolSet, ../bad
scripts_dir: my-scripts
form_dir:
`)
    expect(dirs.ref).toEqual(['refs'])
    expect(dirs.script).toEqual(['my-scripts'])
    expect(dirs.form).toEqual(['form'])
  })
})

describe('referenceUrlLooksLikeForm', () => {
  it('matches .form.md anywhere', () => {
    expect(referenceUrlLooksLikeForm('anywhere/x.form.md', ['hitl'])).toBe(true)
  })

  it('matches any configured form directory', () => {
    expect(referenceUrlLooksLikeForm('hitl/gate.md', ['form', 'hitl'])).toBe(true)
    expect(referenceUrlLooksLikeForm('form/step.md', ['form', 'hitl'])).toBe(true)
    expect(referenceUrlLooksLikeForm('docs/readme.md', ['hitl'])).toBe(false)
  })
})

describe('resolveSkillAttachmentDirs', () => {
  it('reads dirs from skill folder properties', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-dirs-'))
    await seedSkill(root, 'custom', {
      'properties.md':
        'name: C\nrefs_dir: library, refs\nscripts_dir: bin\nform_dir: ui-forms\nmodel: m\nprovider: ollama',
    })
    expect(resolveSkillAttachmentDirs(join(root, 'custom'))).toEqual({
      ref: ['library', 'refs'],
      script: ['bin'],
      form: ['ui-forms'],
    })
  })
})

describe('resolveFormAttachmentDirsForSkill', () => {
  beforeEach(async () => {
    bundledRoot = await mkdtemp(join(tmpdir(), 'skill-form-dir-bundled-'))
    userRoot = await mkdtemp(join(tmpdir(), 'skill-form-dir-user-'))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns default when skill is unknown', () => {
    expect(resolveFormAttachmentDirsForSkill('missing')).toEqual(['form'])
  })

  it('returns configured form dirs for a loaded skill', async () => {
    await seedSkill(userRoot, 'demo', {
      'properties.md':
        'name: D\nform_dir: hitl, form\nmodel: m\nprovider: ollama',
      'hitl/a.form.md': 'form',
    })
    expect(resolveFormAttachmentDirsForSkill('demo')).toEqual(['hitl', 'form'])
  })
})
