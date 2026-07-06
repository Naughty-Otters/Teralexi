import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

function resolveUnpackedExecutable(): string {
  const buildDir = join(process.cwd(), 'build')
  const candidates: string[] = []

  if (process.platform === 'darwin') {
    candidates.push(
      join(buildDir, 'mac-arm64', 'Teralexi.app', 'Contents', 'MacOS', 'Teralexi'),
      join(buildDir, 'mac', 'Teralexi.app', 'Contents', 'MacOS', 'Teralexi'),
      join(buildDir, 'mac-universal', 'Teralexi.app', 'Contents', 'MacOS', 'Teralexi'),
    )
  } else if (process.platform === 'win32') {
    candidates.push(join(buildDir, 'win-unpacked', 'Teralexi.exe'))
  } else {
    candidates.push(
      join(buildDir, 'linux-unpacked', 'teralexi'),
      join(buildDir, 'linux-unpacked', 'Teralexi'),
    )
  }

  const match = candidates.find((path) => existsSync(path))
  if (!match) {
    throw new Error(
      `Unpacked Teralexi executable not found. Run "npm run build:dir:sit" first. Tried:\n${candidates.join('\n')}`,
    )
  }
  return match
}

export type ElectronAppHarness = {
  app: ElectronApplication
  window: Page
}

export async function launchTeralexiApp(): Promise<ElectronAppHarness> {
  const executablePath = resolveUnpackedExecutable()
  const app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      TERALEXI_TEST_MODE: '1',
      TERALEXI_BUILD_ENV: process.env.TERALEXI_BUILD_ENV ?? 'sit',
      NODE_ENV: process.env.NODE_ENV ?? 'sit',
    },
  })

  const window = await app.firstWindow({ timeout: 60_000 })
  await window.waitForLoadState('domcontentloaded')
  return { app, window }
}

export async function closeTeralexiApp(harness: ElectronAppHarness): Promise<void> {
  await harness.app.close()
}
