import { createRequire } from 'node:module'
import { isPackagedApp } from '@main/config/app-paths'
import { getSkillSdkModuleExports } from './skill-sdk-module'

const BLOCKED_SKILL_MODULE_PREFIXES = [
  '@main/',
  '@shared/',
  '@logging/',
  '@openfde-ai/',
  '@config/',
  '@toolSet/',
  '@renderer/',
  '@ipcManager/',
] as const

function isBlockedSkillModuleId(id: string): boolean {
  if (id.startsWith('node:')) return false
  if (id === '@main' || id === '@shared' || id === '@logging' || id === '@config') {
    return true
  }
  return BLOCKED_SKILL_MODULE_PREFIXES.some((prefix) => id.startsWith(prefix))
}

function resolveSkillSdkId(id: string): boolean {
  return id === '@openfde/skill-sdk' || id.startsWith('@openfde/skill-sdk/')
}

/** Require function for esbuild-bundled user skill modules (`@openfde/skill-sdk` only). */
export function createSkillModuleRequire(
  parentFilename: string,
): NodeRequire {
  const parentRequire = createRequire(parentFilename)
  const skillSdk = getSkillSdkModuleExports()

  const skillRequire = ((id: string) => {
    if (resolveSkillSdkId(id)) {
      return skillSdk
    }
    if (isPackagedApp() && isBlockedSkillModuleId(id)) {
      throw new Error(
        `Skill modules cannot import "${id}". Use @openfde/skill-sdk for supported APIs.`,
      )
    }
    return parentRequire(id)
  }) as NodeRequire

  skillRequire.resolve = ((id: string, options?: { paths?: string[] }) =>
    resolveSkillSdkId(id)
      ? id
      : parentRequire.resolve(id, options)) as NodeRequire['resolve']
  skillRequire.cache = parentRequire.cache
  skillRequire.extensions = parentRequire.extensions
  skillRequire.main = parentRequire.main

  return skillRequire
}
