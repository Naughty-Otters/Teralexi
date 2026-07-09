import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClawHubSkillOrigin } from '@shared/skills/clawhub-types'

const skillsDir = join(tmpdir(), `clawhub-origin-test-${process.pid}`)

vi.mock('../skill-path', () => ({
  resolveUserSkillsDirectory: () => skillsDir,
}))

import {
  CLAWHUB_DIR_NAME,
  CLAWHUB_ORIGIN_FILE,
  clawHubOriginPath,
  listClawHubOrigins,
  readClawHubOrigin,
  writeClawHubOrigin,
} from './clawhub-origin'

const sampleOrigin: ClawHubSkillOrigin = {
  registry: 'clawhub',
  slug: 'demo-skill',
  version: '1.2.0',
  installedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  localSkillId: 'demo-skill',
}

describe('clawhub-origin', () => {
  afterEach(() => {
    rmSync(skillsDir, { recursive: true, force: true })
  })

  it('writes and reads origin metadata', () => {
    const skillFolder = join(skillsDir, 'demo-skill')
    mkdirSync(skillFolder, { recursive: true })

    writeClawHubOrigin(skillFolder, sampleOrigin)

    const path = clawHubOriginPath(skillFolder)
    expect(path).toBe(
      join(skillFolder, CLAWHUB_DIR_NAME, CLAWHUB_ORIGIN_FILE),
    )
    expect(readClawHubOrigin(skillFolder)).toEqual(sampleOrigin)
    expect(readFileSync(path, 'utf8')).toContain('"slug": "demo-skill"')
  })

  it('returns null for missing or invalid origin files', () => {
    const skillFolder = mkdtempSync(join(tmpdir(), 'clawhub-missing-'))
    expect(readClawHubOrigin(skillFolder)).toBeNull()

    const invalidFolder = join(skillsDir, 'invalid')
    mkdirSync(join(invalidFolder, CLAWHUB_DIR_NAME), { recursive: true })
    writeFileSync(
      clawHubOriginPath(invalidFolder),
      JSON.stringify({ registry: 'other', slug: 'x' }),
      'utf8',
    )
    expect(readClawHubOrigin(invalidFolder)).toBeNull()
  })

  it('lists installed clawhub origins sorted by local skill id', () => {
    mkdirSync(skillsDir, { recursive: true })
    for (const id of ['beta', 'alpha']) {
      const folder = join(skillsDir, id)
      mkdirSync(folder, { recursive: true })
      writeClawHubOrigin(folder, {
        ...sampleOrigin,
        slug: id,
        localSkillId: id,
      })
    }
    mkdirSync(join(skillsDir, '.hidden'), { recursive: true })
    writeClawHubOrigin(join(skillsDir, '.hidden'), sampleOrigin)

    const listed = listClawHubOrigins()
    expect(listed.map((entry) => entry.localSkillId)).toEqual([
      'alpha',
      'beta',
    ])
    expect(listed[0]?.origin.slug).toBe('alpha')
    expect(existsSync(listed[0]!.folder)).toBe(true)
  })

  it('returns an empty list when skills directory is missing', () => {
    expect(listClawHubOrigins()).toEqual([])
  })
})
