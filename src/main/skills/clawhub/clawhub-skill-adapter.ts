import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { SKILL_DEFAULT_PROPERTIES, SKILL_FILES } from '../constants'
import { parseFrontmatter } from '../skill-markdown'
import {
  extractYamlFrontmatterBlock,
  mergePropertiesRaw,
  parsePropertiesKeyValues,
  resolveBundledSkillsDirectory,
  serializePropertiesKeyValues,
  stripYamlFrontmatter,
} from '../skill-path'

export type DefaultSkillLlm = {
  provider: string
  model: string
}

const REF_ATTACHMENT_DIR_NAMES = new Set([
  'refs',
  'references',
  'reference',
  'assets',
  'docs',
  'doc',
])
const SCRIPT_ATTACHMENT_DIR_NAMES = new Set(['scripts', 'script'])
const FORM_ATTACHMENT_DIR_NAMES = new Set(['form', 'forms'])

function findSkillMarkdownFile(root: string): string | null {
  const candidates = ['SKILL.md', 'skill.md', 'Skill.md']
  for (const name of candidates) {
    const path = join(root, name)
    if (existsSync(path)) return path
  }
  return null
}

function readExistingPropertiesRaw(skillFolder: string): string {
  const propertiesPath = join(skillFolder, SKILL_FILES.PROPERTIES_MD)
  if (!existsSync(propertiesPath)) return ''
  return readFileSync(propertiesPath, 'utf-8')
}

function detectAttachmentDirProperties(
  skillFolder: string,
): Record<string, string> {
  const refDirs: string[] = []
  const scriptDirs: string[] = []
  const formDirs: string[] = []

  let entries: string[]
  try {
    entries = readdirSync(skillFolder)
  } catch {
    return {}
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || entry === SKILL_FILES.ACTIONS_DIR) continue
    const folder = join(skillFolder, entry)
    try {
      if (!statSync(folder).isDirectory()) continue
    } catch {
      continue
    }

    const lower = entry.toLowerCase()
    if (REF_ATTACHMENT_DIR_NAMES.has(lower)) refDirs.push(entry)
    else if (SCRIPT_ATTACHMENT_DIR_NAMES.has(lower)) scriptDirs.push(entry)
    else if (FORM_ATTACHMENT_DIR_NAMES.has(lower)) formDirs.push(entry)
  }

  const out: Record<string, string> = {}
  if (refDirs.length > 0) out.refs_dir = refDirs.join(', ')
  if (scriptDirs.length > 0) out.scripts_dir = scriptDirs.join(', ')
  if (formDirs.length > 0) out.form_dir = formDirs.join(', ')
  return out
}

function buildInstalledProperties(args: {
  skillFrontmatterRaw: string
  displayName: string
  summary: string
  defaults: DefaultSkillLlm
  attachmentDirs: Record<string, string>
  existingPropertiesRaw?: string
  preserveUserProperties?: boolean
}): string {
  const fromSkill = parsePropertiesKeyValues(args.skillFrontmatterRaw)
  const fromPlainSkill = Object.keys(fromSkill).length
    ? fromSkill
    : (parseFrontmatter(args.skillFrontmatterRaw) as Record<string, string>)

  const merged: Record<string, string> = {
    ...fromPlainSkill,
    ...args.attachmentDirs,
    name:
      String(fromPlainSkill.name ?? args.displayName).trim() || args.displayName,
    description:
      String(fromPlainSkill.description ?? args.summary).trim() || args.summary,
    model:
      String(fromPlainSkill.model ?? args.defaults.model).trim() ||
      args.defaults.model,
    provider:
      String(fromPlainSkill.provider ?? args.defaults.provider).trim() ||
      args.defaults.provider,
    color: String(fromPlainSkill.color ?? SKILL_DEFAULT_PROPERTIES.COLOR).trim(),
    enabled:
      fromPlainSkill.enabled === 'false' ||
      fromPlainSkill.enabled === false
        ? 'false'
        : 'true',
    visibility: String(fromPlainSkill.visibility ?? 'chat').trim() || 'chat',
  }

  if (fromPlainSkill.allowed_tools) {
    merged.allowed_tools = String(fromPlainSkill.allowed_tools)
  }
  if (fromPlainSkill.max_iterations) {
    merged.max_iterations = String(fromPlainSkill.max_iterations)
  }

  const existingRaw = args.preserveUserProperties
    ? (args.existingPropertiesRaw ?? '')
    : ''
  return mergePropertiesRaw(
    serializePropertiesKeyValues(merged),
    existingRaw,
  )
}

/** Normalize an extracted ClawHub skill folder into teralexi layout. */
export function normalizeClawHubSkillFolder(args: {
  skillFolder: string
  skillId: string
  displayName: string
  summary: string
  defaults: DefaultSkillLlm
  preserveUserProperties?: boolean
}): void {
  const skillMdPath = findSkillMarkdownFile(args.skillFolder)
  if (!skillMdPath) {
    throw new Error('Downloaded skill is missing SKILL.md')
  }

  const skillRaw = readFileSync(skillMdPath, 'utf-8')
  const skillFrontmatterRaw = extractYamlFrontmatterBlock(skillRaw) ?? ''
  const skillBody = skillFrontmatterRaw
    ? stripYamlFrontmatter(skillRaw).trimStart()
    : skillRaw

  const targetSkillMd = join(args.skillFolder, SKILL_FILES.SKILL_MD)
  writeFileSync(targetSkillMd, skillBody, 'utf-8')

  const sameCaseInsensitiveFile =
    skillMdPath.toLowerCase() === targetSkillMd.toLowerCase()
  if (
    skillMdPath !== targetSkillMd &&
    !sameCaseInsensitiveFile &&
    existsSync(skillMdPath)
  ) {
    try {
      unlinkSync(skillMdPath)
    } catch {
      // best effort — duplicate SKILL.md is harmless
    }
  }

  const attachmentDirs = detectAttachmentDirProperties(args.skillFolder)
  const existingPropertiesRaw = args.preserveUserProperties
    ? readExistingPropertiesRaw(args.skillFolder)
    : ''

  writeFileSync(
    join(args.skillFolder, SKILL_FILES.PROPERTIES_MD),
    buildInstalledProperties({
      skillFrontmatterRaw,
      displayName: args.displayName,
      summary: args.summary,
      defaults: args.defaults,
      attachmentDirs,
      existingPropertiesRaw,
      preserveUserProperties: args.preserveUserProperties,
    }),
    'utf-8',
  )
}

export function resolveDefaultSkillLlmFromBundledDefault(): DefaultSkillLlm {
  const defaultPropsPath = join(
    resolveBundledSkillsDirectory(),
    'default',
    SKILL_FILES.PROPERTIES_MD,
  )
  if (existsSync(defaultPropsPath)) {
    const fm = parseFrontmatter(readFileSync(defaultPropsPath, 'utf-8')) as Record<
      string,
      unknown
    >
    const model = String(fm.model ?? '').trim()
    const provider = String(fm.provider ?? '').trim()
    if (model && provider) {
      return { model, provider }
    }
  }

  return {
    model: SKILL_DEFAULT_PROPERTIES.MODEL,
    provider: SKILL_DEFAULT_PROPERTIES.PROVIDER,
  }
}

export function localSkillIdFromSlug(slug: string): string {
  const normalized = slug
    .trim()
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'clawhub-skill'
}
