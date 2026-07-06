import AdmZip from 'adm-zip'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import semver from 'semver'
import {
  isWorkflowPanelSkillId,
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_RUNTIME_SKILL_ID,
} from '@shared/skills/workflow-panel-skills'
import type {
  ClawHubInstallResult,
  ClawHubInstalledSkill,
  ClawHubSkillDetail,
  ClawHubSkillOrigin,
  ClawHubSkillSearchResult,
  ClawHubUpdateBatchResult,
} from '@shared/skills/clawhub-types'
import { SKILL_FILES } from '../constants'
import { isLoadableSkillFolder, resolveUserSkillsDirectory } from '../skill-path'
import { getClawHubClient } from './clawhub-client'
import {
  listClawHubOrigins,
  readClawHubOrigin,
  writeClawHubOrigin,
} from './clawhub-origin'
import {
  localSkillIdFromSlug,
  normalizeClawHubSkillFolder,
  resolveDefaultSkillLlmFromBundledDefault,
} from './clawhub-skill-adapter'
import { DEFAULT_USER_ID } from '@main/agent/config'
import { getConversationStore } from '@main/services/conversation-store'

const WORKFLOW_SLUG_BLOCKLIST = new Set([
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_RUNTIME_SKILL_ID,
])

function assertClawHubSkillAllowed(slug: string, localSkillId?: string): void {
  const normalizedSlug = slug.trim().toLowerCase()
  if (WORKFLOW_SLUG_BLOCKLIST.has(normalizedSlug)) {
    throw new Error('Workflow skills cannot be installed from ClawHub.')
  }
  if (localSkillId && isWorkflowPanelSkillId(localSkillId)) {
    throw new Error('Workflow skills cannot be managed via ClawHub.')
  }
}

function isBlockedModeration(detail: ClawHubSkillDetail): boolean {
  const moderation = detail.moderation
  if (!moderation) return false
  return Boolean(moderation.isMalwareBlocked || moderation.isSuspicious)
}

function versionIsNewer(latest: string, installed: string): boolean {
  const latestCoerced = semver.coerce(latest)?.version
  const installedCoerced = semver.coerce(installed)?.version
  if (latestCoerced && installedCoerced) {
    return semver.gt(latestCoerced, installedCoerced)
  }
  return latest.trim() !== installed.trim()
}

function cleanupUninstalledSkillRecords(localSkillId: string): void {
  const store = getConversationStore()
  store.deleteAgentConfiguration(`skill:${localSkillId}`, DEFAULT_USER_ID)
  store.deleteSkillCompilations(localSkillId)
}

async function findSkillRootInExtracted(root: string): Promise<string | null> {
  const { readdirSync, statSync } = await import('node:fs')

  function walk(dir: string, depth: number): string[] {
    if (depth > 5) return []
    const hits: string[] = []
    if (
      existsSync(join(dir, SKILL_FILES.SKILL_MD)) ||
      existsSync(join(dir, 'SKILL.md'))
    ) {
      hits.push(dir)
    }
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return hits
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const folder = join(dir, entry)
      try {
        if (!statSync(folder).isDirectory()) continue
      } catch {
        continue
      }
      hits.push(...walk(folder, depth + 1))
    }
    return hits
  }

  const candidates = walk(root, 0)
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => a.length - b.length)[0] ?? null
}

async function extractZipToSkillFolder(
  zipBuffer: Buffer,
  dest: string,
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'teralexi-clawhub-'))
  try {
    const zip = new AdmZip(zipBuffer)
    zip.extractAllTo(tempDir, true)
    const skillRoot = await findSkillRootInExtracted(tempDir)
    if (!skillRoot) {
      throw new Error('No SKILL.md found in downloaded package.')
    }
    await mkdir(dest, { recursive: true })
    await cp(skillRoot, dest, { recursive: true, force: true })
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function writeOriginAndNormalize(args: {
  skillFolder: string
  localSkillId: string
  slug: string
  version: string
  displayName: string
  summary: string
  preserveUserProperties?: boolean
  previousOrigin?: ClawHubSkillOrigin | null
}): Promise<void> {
  const now = new Date().toISOString()
  const origin: ClawHubSkillOrigin = {
    registry: 'clawhub',
    slug: args.slug,
    version: args.version,
    localSkillId: args.localSkillId,
    installedAt: args.previousOrigin?.installedAt ?? now,
    updatedAt: now,
  }
  writeClawHubOrigin(args.skillFolder, origin)

  normalizeClawHubSkillFolder({
    skillFolder: args.skillFolder,
    skillId: args.localSkillId,
    displayName: args.displayName,
    summary: args.summary,
    defaults: resolveDefaultSkillLlmFromBundledDefault(),
    preserveUserProperties: args.preserveUserProperties,
  })
}

export async function searchClawHubSkills(args: {
  query: string
  limit?: number
}): Promise<ClawHubSkillSearchResult> {
  const client = getClawHubClient()
  const result = await client.searchSkills({
    query: args.query,
    limit: args.limit ?? 20,
    nonSuspiciousOnly: true,
  })
  return {
    results: result.results.filter(
      (hit) => !WORKFLOW_SLUG_BLOCKLIST.has(hit.slug.trim().toLowerCase()),
    ),
  }
}

export async function getClawHubSkillDetail(
  slug: string,
): Promise<ClawHubSkillDetail> {
  assertClawHubSkillAllowed(slug)
  return getClawHubClient().getSkill(slug)
}

export async function installClawHubSkill(args: {
  slug: string
  localSkillId?: string
  version?: string
}): Promise<ClawHubInstallResult> {
  const slug = args.slug.trim()
  if (!slug) return { ok: false, error: 'slug is required' }

  const localSkillId = (args.localSkillId?.trim() || localSkillIdFromSlug(slug))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!localSkillId) return { ok: false, error: 'localSkillId is required' }

  try {
    assertClawHubSkillAllowed(slug, localSkillId)
    const client = getClawHubClient()
    const detail = await client.getSkill(slug)
    if (isBlockedModeration(detail)) {
      return {
        ok: false,
        error: 'This skill is blocked by ClawHub moderation.',
      }
    }

    const version = args.version?.trim() || detail.latestVersion.version
    const zip = await client.downloadSkillZip({ slug, version })
    const dest = join(resolveUserSkillsDirectory(), localSkillId)
    await extractZipToSkillFolder(zip, dest)

    await writeOriginAndNormalize({
      skillFolder: dest,
      localSkillId,
      slug,
      version,
      displayName: detail.displayName,
      summary: detail.summary,
      preserveUserProperties: false,
    })

    return { ok: true, localSkillId, version }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function listClawHubInstalledSkills(): Promise<
  ClawHubInstalledSkill[]
> {
  const client = getClawHubClient()
  const installed = listClawHubOrigins()
  const out: ClawHubInstalledSkill[] = []

  for (const entry of installed) {
    const { localSkillId, folder, origin } = entry
    let displayName = localSkillId
    let updateAvailable = false
    let latestVersion: string | undefined

    try {
      const detail = await client.getSkill(origin.slug)
      displayName = detail.displayName
      latestVersion = detail.latestVersion.version
      updateAvailable = versionIsNewer(latestVersion, origin.version)
    } catch {
      // keep defaults when registry lookup fails
    }

    out.push({
      localSkillId,
      slug: origin.slug,
      version: origin.version,
      displayName,
      installedAt: origin.installedAt,
      updatedAt: origin.updatedAt,
      updateAvailable,
      ...(latestVersion ? { latestVersion } : {}),
    })
  }

  return out
}

export async function updateClawHubSkill(args: {
  localSkillId: string
}): Promise<ClawHubInstallResult> {
  const localSkillId = args.localSkillId.trim()
  if (!localSkillId) return { ok: false, error: 'localSkillId is required' }

  const folder = join(resolveUserSkillsDirectory(), localSkillId)
  const origin = readClawHubOrigin(folder)
  if (!origin) {
    return { ok: false, error: 'Skill was not installed from ClawHub.' }
  }

  try {
    assertClawHubSkillAllowed(origin.slug, localSkillId)
    const client = getClawHubClient()
    const detail = await client.getSkill(origin.slug)
    if (isBlockedModeration(detail)) {
      return {
        ok: false,
        error: 'This skill is blocked by ClawHub moderation.',
      }
    }

    const version = detail.latestVersion.version
    if (!versionIsNewer(version, origin.version)) {
      return { ok: true, localSkillId, version: origin.version }
    }

    const zip = await client.downloadSkillZip({ slug: origin.slug, version })
    await extractZipToSkillFolder(zip, folder)

    await writeOriginAndNormalize({
      skillFolder: folder,
      localSkillId,
      slug: origin.slug,
      version,
      displayName: detail.displayName,
      summary: detail.summary,
      preserveUserProperties: true,
      previousOrigin: origin,
    })

    return { ok: true, localSkillId, version }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function updateAllClawHubSkills(): Promise<
  ClawHubUpdateBatchResult[]
> {
  const installed = listClawHubOrigins()
  const results: ClawHubUpdateBatchResult[] = []

  for (const entry of installed) {
    const result = await updateClawHubSkill({
      localSkillId: entry.localSkillId,
    })
    if (!result.ok) {
      results.push({
        localSkillId: entry.localSkillId,
        slug: entry.origin.slug,
        status: 'failed',
        message: result.error,
      })
      continue
    }

    const updated =
      result.version != null && result.version !== entry.origin.version
    results.push({
      localSkillId: entry.localSkillId,
      slug: entry.origin.slug,
      status: updated ? 'updated' : 'skipped',
      ...(result.version ? { version: result.version } : {}),
    })
  }

  return results
}

export async function uninstallClawHubSkill(args: {
  localSkillId: string
}): Promise<{ ok: boolean; error?: string }> {
  const localSkillId = args.localSkillId.trim()
  if (!localSkillId) return { ok: false, error: 'localSkillId is required' }

  const folder = join(resolveUserSkillsDirectory(), localSkillId)
  const origin = readClawHubOrigin(folder)
  if (!origin) {
    return { ok: false, error: 'Skill was not installed from ClawHub.' }
  }

  if (!isLoadableSkillFolder(resolveUserSkillsDirectory(), localSkillId)) {
    return { ok: false, error: 'Skill folder not found.' }
  }

  try {
    await rm(folder, { recursive: true, force: true })
    cleanupUninstalledSkillRecords(localSkillId)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function previewClawHubSkillFile(args: {
  slug: string
  path?: string
}): Promise<{ content: string }> {
  assertClawHubSkillAllowed(args.slug)
  const baseUrl = process.env.CLAWHUB_REGISTRY?.trim() || 'https://clawhub.ai'
  const params = new URLSearchParams({
    path: args.path?.trim() || 'SKILL.md',
  })
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/api/v1/skills/${encodeURIComponent(args.slug)}/file?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to load skill file (${response.status})`)
  }
  return { content: await response.text() }
}
