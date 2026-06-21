import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Compile bundled toolSet modules into dist so packaged apps can load tools
 * without relying on a writable runtime esbuild cache in ~/.openfde.
 */
export async function prewarmSkillModuleCache(): Promise<void> {
  const cacheDir = join(process.cwd(), 'dist', 'electron', 'skill-module-cache')
  mkdirSync(cacheDir, { recursive: true })
  process.env.OPENFDE_SKILL_MODULE_CACHE_DIR = cacheDir

  const { loadToolSetTools } = await import('../src/main/skills/skill-module-loader')
  const tools = await loadToolSetTools()
  console.log(`prewarm: ${tools.length} toolSet tools`)
}
