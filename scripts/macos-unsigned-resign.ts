import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function findMacAppBundles(buildDir: string): string[] {
  if (!existsSync(buildDir)) return []

  const apps: string[] = []
  for (const entry of readdirSync(buildDir)) {
    if (!entry.startsWith('mac')) continue
    const platformDir = join(buildDir, entry)
    let children: string[]
    try {
      children = readdirSync(platformDir)
    } catch {
      continue
    }
    for (const child of children) {
      if (child.endsWith('.app')) apps.push(join(platformDir, child))
    }
  }
  return apps
}

export function deepAdhocSignMacApp(appPath: string): void {
  const result = spawnSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', appPath],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error(`adhoc re-sign failed for ${appPath}`)
  }
}

/** electron-builder signs after afterPack — re-sign once packaging is fully done. */
export function resignUnsignedMacAppsInBuildOutput(
  buildDir = join(process.cwd(), 'build'),
): string[] {
  const signed: string[] = []
  for (const appPath of findMacAppBundles(buildDir)) {
    deepAdhocSignMacApp(appPath)
    signed.push(appPath)
  }
  return signed
}
