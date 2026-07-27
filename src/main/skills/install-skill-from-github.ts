import { execFile } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import {
  resolveUserSkillsDirectory,
  isLoadableSkillFolder,
} from './skill-path'
import { hasSkillInstructionMarker } from './skill-ecosystem'
import { compileSkill } from './skill-compiler'
import {
  normalizeClawHubSkillFolder,
  resolveDefaultSkillLlmFromBundledDefault,
} from './clawhub/clawhub-skill-adapter'

const execFileAsync = promisify(execFile)

export type InstallSkillResult =
  | { ok: true; skillId: string }
  | { ok: false; error: string }

function parseGithubUrl(url: string): {
  cloneUrl: string
  subPath: string
  defaultId: string
} | null {
  const trimmed = url.trim()
  const treeMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+(?:\/(.+))?)?\/?$/i,
  )
  if (treeMatch) {
    const [, owner, repo, subPath = ''] = treeMatch
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subPath: subPath.replace(/\/$/, ''),
      defaultId: subPath ? basename(subPath) : repo,
    }
  }
  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/)
  if (shortMatch) {
    const [, owner, repo] = shortMatch
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subPath: '',
      defaultId: repo,
    }
  }
  return null
}

async function findSkillRoot(
  cloneDir: string,
  subPath: string,
): Promise<string | null> {
  const candidates = [
    subPath ? join(cloneDir, subPath) : cloneDir,
    join(cloneDir, 'skills', basename(subPath) || ''),
  ].filter((p) => p && hasSkillInstructionMarker(p))

  if (candidates.length > 0) return candidates[0]

  const skillsDir = join(cloneDir, 'skills')
  if (existsSync(skillsDir)) {
    const { readdirSync } = await import('node:fs')
    for (const entry of readdirSync(skillsDir)) {
      const folder = join(skillsDir, entry)
      if (isLoadableSkillFolder(skillsDir, entry)) return folder
    }
  }

  if (hasSkillInstructionMarker(cloneDir)) return cloneDir
  return null
}

export async function installSkillFromGithub(args: {
  url: string
  skillId?: string
}): Promise<InstallSkillResult> {
  const parsed = parseGithubUrl(args.url)
  if (!parsed) {
    return {
      ok: false,
      error:
        'Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo.',
    }
  }

  const skillId = (args.skillId?.trim() || parsed.defaultId).replace(
    /[^a-zA-Z0-9_-]/g,
    '-',
  )
  if (!skillId) return { ok: false, error: 'skillId is required' }

  const tempDir = await mkdtemp(join(tmpdir(), 'teralexi-skill-'))
  try {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', parsed.cloneUrl, tempDir],
      {
        timeout: 120_000,
      },
    )
    const skillRoot = await findSkillRoot(tempDir, parsed.subPath)
    if (!skillRoot) {
      return {
        ok: false,
        error:
          'No skill instruction file found (skill.md, SKILL.md, skills.md, AGENT.md, …).',
      }
    }

    const dest = join(resolveUserSkillsDirectory(), skillId)
    await cp(skillRoot, dest, { recursive: true, force: true })
    normalizeClawHubSkillFolder({
      skillFolder: dest,
      skillId,
      displayName: skillId,
      summary: '',
      defaults: resolveDefaultSkillLlmFromBundledDefault(),
      preserveUserProperties: true,
    })
    await compileSkill(skillId, { force: true })
    return { ok: true, skillId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
