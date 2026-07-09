import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bundledSkillFolder,
  getBundledSkillIds,
  getBundledSkillSource,
  isBundledSkillId,
  listBundledSkillAttachments,
  materializeBundledSkillToDirectory,
  readBundledSkillAttachment,
  verifyBundledSkillsManifest,
} from './bundled-skills-manifest'

describe('bundled-skills-manifest', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('recognizes bundled skill ids', () => {
    expect(isBundledSkillId('documents')).toBe(true)
    expect(isBundledSkillId('not-a-skill')).toBe(false)
    expect(getBundledSkillIds().length).toBeGreaterThan(0)
  })

  it('lists bundled attachments with metadata', () => {
    const attachments = listBundledSkillAttachments('documents')
    expect(attachments.length).toBeGreaterThan(0)
    expect(attachments[0]).toMatchObject({
      source: 'bundled',
      category: expect.stringMatching(/^(ref|script|form)$/),
      relativePath: expect.any(String),
      fileName: expect.any(String),
      sizeBytes: expect.any(Number),
    })
  })

  it('reads bundled attachments with mime types', () => {
    const body = readBundledSkillAttachment(
      'documents',
      'templates/manifest.json',
    )
    expect(body.encoding).toBe('utf8')
    expect(body.mimeType).toBe('application/json')
    expect(body.content).toContain('"templates"')
  })

  it('normalizes attachment paths and throws when missing', () => {
    expect(() =>
      readBundledSkillAttachment('documents', '/missing/file.json'),
    ).toThrow(/Attachment not found/)
  })

  it('materializes bundled skill sources to disk', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'bundled-skill-'))
    const dest = join(tempDir, 'documents')
    const ok = materializeBundledSkillToDirectory(dest, 'documents')

    expect(ok).toBe(true)
    expect(readFileSync(join(dest, 'skill.md'), 'utf8')).toBe(
      getBundledSkillSource('documents')!.skillMd,
    )
    expect(
      existsSync(join(dest, 'templates', 'manifest.json')),
    ).toBe(true)
  })

  it('returns false when materializing unknown skills', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'bundled-skill-'))
    expect(
      materializeBundledSkillToDirectory(join(tempDir, 'missing'), 'missing'),
    ).toBe(false)
  })

  it('uses virtual bundled folder paths', () => {
    expect(bundledSkillFolder('research')).toBe('bundled-skills/research')
  })

  it('verifyBundledSkillsManifest validates generated catalog', () => {
    expect(() => verifyBundledSkillsManifest()).not.toThrow()
  })
})
