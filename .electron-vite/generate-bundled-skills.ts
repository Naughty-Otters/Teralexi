import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative } from 'node:path'
import { parseAttachmentDirsFromProperties } from '../src/main/skills/skill-attachment-dirs'
import { SKILL_FILES } from '../src/main/skills/constants'
import { isLoadableSkillFolder } from '../src/main/skills/skill-path'

const SKILLS_ROOT = join(process.cwd(), 'skills')
const OUT_FILE = join(process.cwd(), 'src/main/skills/bundled-skills.generated.ts')

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

const SKIP_FILE_RE = /\.(?:test|integration\.test|mocked\.test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i

type GeneratedAttachment = {
  category: 'ref' | 'script' | 'form'
  encoding: 'utf8' | 'base64'
  content: string
}

type GeneratedSkill = {
  skillMd: string
  propertiesMd: string
  attachments: Record<string, GeneratedAttachment>
}

function isTextAttachment(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    TEXT_EXTENSIONS.has(lower) ||
    lower.endsWith('.form.md') ||
    [...TEXT_EXTENSIONS].some((ext) => lower.endsWith(ext))
  )
}

function isHiddenOrIgnored(name: string): boolean {
  return name.startsWith('.') || name === '__pycache__' || name === 'node_modules'
}

function walkFiles(dir: string, rootDir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (isHiddenOrIgnored(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walkFiles(full, rootDir, out)
      continue
    }
    if (!st.isFile()) continue
    if (SKIP_FILE_RE.test(entry)) continue
    out.push(relative(rootDir, full).split('\\').join('/'))
  }
}

function categorizeAttachmentPath(
  relPath: string,
  dirs: ReturnType<typeof parseAttachmentDirsFromProperties>,
): 'ref' | 'script' | 'form' | null {
  for (const category of ['ref', 'script', 'form'] as const) {
    for (const dir of dirs[category]) {
      if (relPath === dir || relPath.startsWith(`${dir}/`)) {
        return category
      }
    }
  }
  return null
}

function collectSkillAttachments(
  skillFolder: string,
  propertiesMd: string,
): Record<string, GeneratedAttachment> {
  const dirs = parseAttachmentDirsFromProperties(propertiesMd)
  const attachments: Record<string, GeneratedAttachment> = {}

  for (const category of ['ref', 'script', 'form'] as const) {
    for (const categoryDir of dirs[category]) {
      const absDir = join(skillFolder, categoryDir)
      if (!existsSync(absDir)) continue
      const files: string[] = []
      walkFiles(absDir, skillFolder, files)
      const prefix = `${categoryDir}/`
      for (const rel of files) {
        if (rel !== categoryDir && !rel.startsWith(prefix)) continue
        const absPath = join(skillFolder, rel)
        const fileName = basename(rel)
        const asText = isTextAttachment(fileName)
        attachments[rel] = {
          category,
          encoding: asText ? 'utf8' : 'base64',
          content: asText
            ? readFileSync(absPath, 'utf-8')
            : readFileSync(absPath).toString('base64'),
        }
      }
    }
  }

  return attachments
}

function escapeTemplateLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function serializeRecord(
  record: Record<string, GeneratedSkill>,
): string {
  const lines: string[] = []
  for (const [skillId, skill] of Object.entries(record).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`  ${JSON.stringify(skillId)}: {`)
    lines.push(`    skillMd: \`${escapeTemplateLiteral(skill.skillMd)}\`,`)
    lines.push(
      `    propertiesMd: \`${escapeTemplateLiteral(skill.propertiesMd)}\`,`,
    )
    lines.push(`    attachments: {`)
    for (const [relPath, attachment] of Object.entries(skill.attachments).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      lines.push(`      ${JSON.stringify(relPath)}: {`)
      lines.push(`        category: ${JSON.stringify(attachment.category)},`)
      lines.push(`        encoding: ${JSON.stringify(attachment.encoding)},`)
      lines.push(
        `        content: \`${escapeTemplateLiteral(attachment.content)}\`,`,
      )
      lines.push(`      },`)
    }
    lines.push(`    },`)
    lines.push(`  },`)
  }
  return lines.join('\n')
}

export function generateBundledSkillsManifest(): string[] {
  const bundled: Record<string, GeneratedSkill> = {}

  if (!existsSync(SKILLS_ROOT)) {
    throw new Error(`skills root missing: ${SKILLS_ROOT}`)
  }

  for (const entry of readdirSync(SKILLS_ROOT)) {
    if (!isLoadableSkillFolder(SKILLS_ROOT, entry)) continue
    const skillFolder = join(SKILLS_ROOT, entry)
    const skillMd = readFileSync(
      join(skillFolder, SKILL_FILES.SKILL_MD),
      'utf-8',
    )
    const propertiesPath = join(skillFolder, SKILL_FILES.PROPERTIES_MD)
    const propertiesMd = existsSync(propertiesPath)
      ? readFileSync(propertiesPath, 'utf-8')
      : ''

    bundled[entry] = {
      skillMd,
      propertiesMd,
      attachments: collectSkillAttachments(skillFolder, propertiesMd),
    }
  }

  const skillIds = Object.keys(bundled).sort()
  if (skillIds.length === 0) {
    throw new Error('bundled skills manifest is empty')
  }

  const source = `/* eslint-disable */
// Generated by .electron-vite/generate-bundled-skills.ts — do not edit manually.

export type BundledSkillAttachment = {
  category: 'ref' | 'script' | 'form'
  encoding: 'utf8' | 'base64'
  content: string
}

export type BundledSkillSource = {
  skillMd: string
  propertiesMd: string
  attachments: Record<string, BundledSkillAttachment>
}

export const BUNDLED_SKILL_SOURCES: Record<string, BundledSkillSource> = {
${serializeRecord(bundled)}
}

export const BUNDLED_SKILL_IDS = ${JSON.stringify(skillIds)} as const
`

  mkdirSync(join(OUT_FILE, '..'), { recursive: true })
  writeFileSync(OUT_FILE, source, 'utf-8')
  return skillIds
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = generateBundledSkillsManifest()
  const hash = createHash('sha256')
    .update(readFileSync(OUT_FILE))
    .digest('hex')
    .slice(0, 12)
  console.log(`generated ${ids.length} bundled skills (${hash})`)
}
