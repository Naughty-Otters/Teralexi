import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import {
  BUNDLED_SKILL_IDS,
  BUNDLED_SKILL_SOURCES,
  type BundledSkillAttachment,
  type BundledSkillSource,
} from './bundled-skills.generated'

export {
  BUNDLED_SKILL_IDS,
  BUNDLED_SKILL_SOURCES,
  type BundledSkillAttachment,
  type BundledSkillSource,
} from './bundled-skills.generated'

export function isBundledSkillId(skillId: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUNDLED_SKILL_SOURCES, skillId)
}

export function getBundledSkillIds(): readonly string[] {
  return BUNDLED_SKILL_IDS
}

export function getBundledSkillSource(skillId: string): BundledSkillSource | null {
  return BUNDLED_SKILL_SOURCES[skillId] ?? null
}

export function listBundledSkillAttachments(skillId: string): Array<{
  category: BundledSkillAttachment['category']
  relativePath: string
  fileName: string
  source: 'bundled'
  sizeBytes: number
}> {
  const source = getBundledSkillSource(skillId)
  if (!source) return []

  return Object.entries(source.attachments)
    .map(([relativePath, attachment]) => ({
      category: attachment.category,
      relativePath,
      fileName: relativePath.split('/').pop() ?? relativePath,
      source: 'bundled' as const,
      sizeBytes: Buffer.byteLength(
        attachment.content,
        attachment.encoding === 'utf8' ? 'utf8' : 'base64',
      ),
    }))
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.relativePath.localeCompare(b.relativePath)
    })
}

export function readBundledSkillAttachment(
  skillId: string,
  relativePath: string,
): { content: string; encoding: 'utf8' | 'base64'; mimeType: string } {
  const normalized = relativePath.replace(/^[/\\]+/, '').split('\\').join('/')
  const attachment = getBundledSkillSource(skillId)?.attachments[normalized]
  if (!attachment) {
    throw new Error(`Attachment not found: ${relativePath}`)
  }

  const fileName = normalized.split('/').pop() ?? normalized
  return {
    content: attachment.content,
    encoding: attachment.encoding,
    mimeType: guessMimeType(fileName, attachment.encoding === 'utf8'),
  }
}

function guessMimeType(fileName: string, text: boolean): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.form.md')) return 'text/markdown'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.sh')) return 'text/x-shellscript'
  if (lower.endsWith('.py')) return 'text/x-python'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (text) return 'text/plain'
  return 'application/octet-stream'
}

/** Virtual folder path for bundled skills when sources are not shipped on disk. */
export function bundledSkillFolder(skillId: string): string {
  return join('bundled-skills', skillId)
}

/** Write bundled skill sources to disk (sandbox mirror or dev fallback). */
export function materializeBundledSkillToDirectory(
  destSkillFolder: string,
  skillId: string,
): boolean {
  const source = getBundledSkillSource(skillId)
  if (!source) return false

  mkdirSync(destSkillFolder, { recursive: true })
  writeFileSync(join(destSkillFolder, 'skill.md'), source.skillMd, 'utf-8')
  if (source.propertiesMd.trim()) {
    writeFileSync(
      join(destSkillFolder, 'properties.md'),
      source.propertiesMd,
      'utf-8',
    )
  }

  for (const [relativePath, attachment] of Object.entries(source.attachments)) {
    const destPath = join(destSkillFolder, relativePath)
    mkdirSync(dirname(destPath), { recursive: true })
    writeFileSync(
      destPath,
      attachment.encoding === 'utf8'
        ? attachment.content
        : Buffer.from(attachment.content, 'base64'),
    )
  }

  return true
}

export function verifyBundledSkillsManifest(): void {
  if (BUNDLED_SKILL_IDS.length === 0) {
    throw new Error('bundled skills catalog is empty after generation')
  }
  for (const skillId of BUNDLED_SKILL_IDS) {
    const source = BUNDLED_SKILL_SOURCES[skillId]
    if (!source?.skillMd.trim()) {
      throw new Error(`bundled skill ${skillId} is missing skill.md content`)
    }
  }
}
