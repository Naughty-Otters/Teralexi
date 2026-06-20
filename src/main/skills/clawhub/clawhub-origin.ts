import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ClawHubSkillOrigin } from '@shared/skills/clawhub-types'
import { resolveUserSkillsDirectory } from '../skill-path'

export const CLAWHUB_DIR_NAME = '.clawhub'
export const CLAWHUB_ORIGIN_FILE = 'origin.json'

export function clawHubOriginPath(skillFolder: string): string {
  return join(skillFolder, CLAWHUB_DIR_NAME, CLAWHUB_ORIGIN_FILE)
}

export function readClawHubOrigin(skillFolder: string): ClawHubSkillOrigin | null {
  const path = clawHubOriginPath(skillFolder)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ClawHubSkillOrigin
    if (parsed.registry !== 'clawhub' || !parsed.slug || !parsed.version) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeClawHubOrigin(
  skillFolder: string,
  origin: ClawHubSkillOrigin,
): void {
  const dir = join(skillFolder, CLAWHUB_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    clawHubOriginPath(skillFolder),
    `${JSON.stringify(origin, null, 2)}\n`,
    'utf-8',
  )
}

export function listClawHubOrigins(): Array<{
  localSkillId: string
  folder: string
  origin: ClawHubSkillOrigin
}> {
  const skillsDir = resolveUserSkillsDirectory()
  if (!existsSync(skillsDir)) return []

  const out: Array<{
    localSkillId: string
    folder: string
    origin: ClawHubSkillOrigin
  }> = []

  for (const entry of readdirSync(skillsDir)) {
    if (entry.startsWith('.')) continue
    const folder = join(skillsDir, entry)
    try {
      if (!statSync(folder).isDirectory()) continue
    } catch {
      continue
    }
    const origin = readClawHubOrigin(folder)
    if (!origin) continue
    out.push({
      localSkillId: entry,
      folder,
      origin,
    })
  }

  return out.sort((a, b) => a.localSkillId.localeCompare(b.localSkillId))
}
