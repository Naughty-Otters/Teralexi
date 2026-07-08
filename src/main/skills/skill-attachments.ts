import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, join, relative } from 'path'
import { SKILL_FILES } from './constants'
import {
  resolveSkillAttachmentDirs,
  type SkillAttachmentCategory,
} from './skill-attachment-dirs'
import {
  isBundledSkillId,
  listBundledSkillAttachments,
  readBundledSkillAttachment,
} from './bundled-skills-manifest'
import {
  isLoadableSkillFolder,
  resolveSkillsSources,
  resolveUserSkillsDirectory,
  userOverridesBundledSkill,
} from './skill-path'

export type { SkillAttachmentCategory } from './skill-attachment-dirs'

export type SkillAttachmentSource = 'bundled' | 'user'

export type SkillAttachment = {
  category: SkillAttachmentCategory
  /** Path under the skill folder, e.g. `refs/report-format.md` */
  relativePath: string
  fileName: string
  absolutePath: string
  source: SkillAttachmentSource
  sizeBytes: number
}

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.csv',
  '.sh',
  '.bash',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.form.md',
])

function isHiddenOrIgnored(name: string): boolean {
  return name.startsWith('.') || name === '__pycache__' || name === 'node_modules'
}

function walkFiles(dir: string, rootDir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (isHiddenOrIgnored(entry)) continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walkFiles(full, rootDir, out)
      continue
    }
    if (!st.isFile()) continue
    out.push(relative(rootDir, full).split('\\').join('/'))
  }
}

function listCategoryFiles(
  skillFolder: string,
  category: SkillAttachmentCategory,
  dirs: ReturnType<typeof resolveSkillAttachmentDirs>,
): string[] {
  const paths: string[] = []
  for (const categoryDir of dirs[category]) {
    const dir = join(skillFolder, categoryDir)
    if (!existsSync(dir)) continue
    const files: string[] = []
    walkFiles(dir, skillFolder, files)
    const prefix = `${categoryDir}/`
    paths.push(
      ...files.filter((rel) => rel === categoryDir || rel.startsWith(prefix)),
    )
  }
  return [...new Set(paths)]
}

function listDiskSkillAttachments(
  source: SkillAttachmentSource,
  dir: string,
): SkillAttachment[] {
  if (!existsSync(join(dir, SKILL_FILES.SKILL_MD))) return []

  const attachmentDirs = resolveSkillAttachmentDirs(dir)
  const out: SkillAttachment[] = []

  for (const category of Object.keys(
    attachmentDirs,
  ) as SkillAttachmentCategory[]) {
    for (const rel of listCategoryFiles(dir, category, attachmentDirs)) {
      const absolutePath = join(dir, rel)
      let sizeBytes = 0
      try {
        sizeBytes = statSync(absolutePath).size
      } catch {
        continue
      }
      out.push({
        category,
        relativePath: rel,
        fileName: basename(rel),
        absolutePath,
        source,
        sizeBytes,
      })
    }
  }

  return out
}

/**
 * Lists ref docs, scripts, and forms for a skill from bundled + user trees.
 * User entries overwrite bundled entries with the same `relativePath`.
 * Attachment roots come from `properties.md` (`refs_dir`, `scripts_dir`, `form_dir`;
 * each accepts a comma-separated list of skill-relative folders).
 */
export function listSkillAttachments(skillId: string): SkillAttachment[] {
  const id = skillId.trim()
  if (!id) return []

  const merged = new Map<string, SkillAttachment>()

  if (isBundledSkillId(id) && !userOverridesBundledSkill(id)) {
    for (const attachment of listBundledSkillAttachments(id)) {
      merged.set(attachment.relativePath, {
        ...attachment,
        absolutePath: join('bundled-skills', id, attachment.relativePath),
      })
    }
  } else {
    const { bundled } = resolveSkillsSources()
    for (const attachment of listDiskSkillAttachments(
      'bundled',
      join(bundled, id),
    )) {
      merged.set(attachment.relativePath, attachment)
    }
  }

  const { user } = resolveSkillsSources()
  for (const attachment of listDiskSkillAttachments('user', join(user, id))) {
    merged.set(attachment.relativePath, attachment)
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category)
    }
    return a.relativePath.localeCompare(b.relativePath)
  })
}

export function resolveSkillAttachment(
  skillId: string,
  relativePath: string,
): SkillAttachment | null {
  const normalized = relativePath.replace(/^[/\\]+/, '').split('\\').join('/')
  return (
    listSkillAttachments(skillId).find((a) => a.relativePath === normalized) ??
    null
  )
}

export function readSkillAttachment(
  skillId: string,
  relativePath: string,
): { content: string; encoding: 'utf8' | 'base64'; mimeType: string } {
  const normalized = relativePath.replace(/^[/\\]+/, '').split('\\').join('/')
  const entry = resolveSkillAttachment(skillId, normalized)
  if (!entry) {
    throw new Error(`Attachment not found: ${relativePath}`)
  }

  if (
    entry.source === 'bundled' &&
    isBundledSkillId(skillId) &&
    !userOverridesBundledSkill(skillId)
  ) {
    return readBundledSkillAttachment(skillId, normalized)
  }

  const lower = entry.fileName.toLowerCase()
  const asText =
    TEXT_EXTENSIONS.has(lower) ||
    lower.endsWith('.form.md') ||
    [...TEXT_EXTENSIONS].some((ext) => lower.endsWith(ext))

  if (asText) {
    return {
      content: readFileSync(entry.absolutePath, 'utf-8'),
      encoding: 'utf8',
      mimeType: guessMimeType(entry.fileName, true),
    }
  }

  return {
    content: readFileSync(entry.absolutePath).toString('base64'),
    encoding: 'base64',
    mimeType: guessMimeType(entry.fileName, false),
  }
}

function guessMimeType(fileName: string, text: boolean): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.form.md')) return 'text/markdown'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.sh')) return 'text/x-shellscript'
  if (lower.endsWith('.py')) return 'text/x-python'
  if (text) return 'text/plain'
  return 'application/octet-stream'
}
