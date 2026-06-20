import { readSkillAttachment } from '../../../../src/main/skills/skill-attachments'
import {
  DOCUMENTS_SKILL_ID,
  type TemplateManifest,
  type TemplateManifestEntry,
} from './types'

const MANIFEST_PATH = 'templates/manifest.json'

export function parseManifestJson(raw: string): TemplateManifest {
  const parsed = JSON.parse(raw) as TemplateManifest
  if (!parsed?.templates || !Array.isArray(parsed.templates)) {
    throw new Error('Invalid template manifest: missing templates array')
  }
  return parsed
}

export function loadManifest(): TemplateManifest {
  const { content } = readSkillAttachment(DOCUMENTS_SKILL_ID, MANIFEST_PATH)
  return parseManifestJson(content)
}

export function getTemplateById(
  manifest: TemplateManifest,
  templateId: string,
): TemplateManifestEntry | null {
  const id = templateId.trim()
  return manifest.templates.find((t) => t.id === id) ?? null
}

export function listTemplateIds(manifest: TemplateManifest): string[] {
  return manifest.templates.map((t) => t.id)
}
