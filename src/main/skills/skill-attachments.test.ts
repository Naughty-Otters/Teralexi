import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let bundledRoot = ''
let userRoot = ''

vi.mock('./skill-path', () => ({
  resolveSkillsSources: vi.fn(() => ({
    bundled: bundledRoot,
    user: userRoot,
  })),
}))

import {
  listSkillAttachments,
  readSkillAttachment,
  resolveSkillAttachment,
} from './skill-attachments'
import { SKILL_FILES } from './constants'

async function writeSkillTree(
  root: string,
  skillId: string,
  files: Record<string, string>,
): Promise<void> {
  const base = join(root, skillId)
  await mkdir(base, { recursive: true })
  await writeFile(join(base, SKILL_FILES.SKILL_MD), '# skill')
  for (const [rel, body] of Object.entries(files)) {
    const full = join(base, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body)
  }
}

describe('skill-attachments', () => {
  beforeEach(async () => {
    bundledRoot = await mkdtemp(join(tmpdir(), 'skill-att-bundled-'))
    userRoot = await mkdtemp(join(tmpdir(), 'skill-att-user-'))
    await writeSkillTree(bundledRoot, 'demo', {
      'refs/a.md': 'ref-a',
      'scripts/run.sh': '#!/bin/sh',
      'form/x.form.md': 'form-a',
    })
    await writeSkillTree(userRoot, 'demo', {
      'refs/a.md': 'ref-user',
      'form/y.form.md': 'form-user',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('merges attachments with user winning on path conflicts', () => {
    const list = listSkillAttachments('demo')
    const byPath = new Map(list.map((a) => [a.relativePath, a]))
    expect(byPath.get('refs/a.md')?.source).toBe('user')
    expect(byPath.get('scripts/run.sh')?.source).toBe('bundled')
    expect(byPath.get('form/y.form.md')?.source).toBe('user')
    expect(list.some((a) => a.category === 'ref')).toBe(true)
    expect(list.some((a) => a.category === 'script')).toBe(true)
    expect(list.some((a) => a.category === 'form')).toBe(true)
  })

  it('lists files under multiple custom attachment dirs', async () => {
    await writeSkillTree(userRoot, 'custom-layout', {
      'properties.md': [
        'name: Custom',
        'description: test',
        'refs_dir: docs, refs',
        'scripts_dir: bin, scripts',
        'form_dir: hitl, form',
        'model: gemma4',
        'provider: ollama',
      ].join('\n'),
      'docs/guide.md': 'guide',
      'refs/legacy.md': 'legacy',
      'bin/run.py': 'print(1)',
      'scripts/legacy.sh': '#!/bin/sh',
      'hitl/ask.form.md': 'form body',
      'form/default.form.md': 'default form',
    })

    const list = listSkillAttachments('custom-layout')
    const paths = list.map((a) => a.relativePath).sort()
    expect(paths).toEqual([
      'bin/run.py',
      'docs/guide.md',
      'form/default.form.md',
      'hitl/ask.form.md',
      'refs/legacy.md',
      'scripts/legacy.sh',
    ])
  })

  it('falls back to default dirs when custom dirs are invalid', async () => {
    await writeSkillTree(bundledRoot, 'bad-props', {
      'properties.md': 'name: B\nrefs_dir: toolSet\nscripts_dir: scripts\nform_dir: form\nmodel: m\nprovider: ollama',
      'refs/only.md': 'ok',
    })
    const list = listSkillAttachments('bad-props')
    expect(list.map((a) => a.relativePath)).toEqual(['refs/only.md'])
  })

  it('reads merged attachment content', () => {
    const body = readSkillAttachment('demo', 'refs/a.md')
    expect(body.encoding).toBe('utf8')
    expect(body.content).toBe('ref-user')
  })

  it('returns empty list for blank skill id', () => {
    expect(listSkillAttachments('  ')).toEqual([])
  })

  it('resolveSkillAttachment normalizes path separators', () => {
    const hit = resolveSkillAttachment('demo', '\\refs\\a.md')
    expect(hit?.relativePath).toBe('refs/a.md')
  })

  it('readSkillAttachment throws when missing', () => {
    expect(() => readSkillAttachment('demo', 'refs/missing.md')).toThrow(
      /not found/i,
    )
  })

  it('reads binary attachments as base64', async () => {
    const binDir = join(bundledRoot, 'demo', 'scripts')
    await mkdir(binDir, { recursive: true })
    await writeFile(join(binDir, 'data.bin'), Buffer.from([0, 1, 2]))
    const body = readSkillAttachment('demo', 'scripts/data.bin')
    expect(body.encoding).toBe('base64')
    expect(body.mimeType).toBe('application/octet-stream')
  })
})
