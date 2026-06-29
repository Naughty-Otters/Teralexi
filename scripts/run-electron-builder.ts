import { spawnSync } from 'node:child_process'
import { applyBuildEnvFromArgv } from '../.electron-vite/utils'
import {
  applyCodeSigningEnv,
  buildElectronBuilderExtraArgs,
  isMacCodeSigningConfigured,
  isMacNotarizeConfigured,
  isWindowsCodeSigningConfigured,
} from '../config/code-signing-env'

applyBuildEnvFromArgv()
const signingEnv = applyCodeSigningEnv()

const userArgs = process.argv.slice(2)
const args = [...userArgs, ...buildElectronBuilderExtraArgs(signingEnv)]

const buildingMac = userArgs.some(
  (arg) => arg === '--mac' || arg.startsWith('--mac='),
)
const buildingWin = userArgs.some(
  (arg) =>
    arg === '--win' ||
    arg.startsWith('--win=') ||
    arg.includes('--win ') ||
    userArgs.includes('--x64') ||
    userArgs.includes('--ia32'),
)

if (buildingMac) {
  if (isMacCodeSigningConfigured(signingEnv)) {
    console.log('[code-sign] macOS signing configured')
    if (isMacNotarizeConfigured(signingEnv)) {
      console.log('[code-sign] Apple notarization enabled')
    }
  } else {
    console.log(
      '[code-sign] No macOS signing env found — build will be unsigned. Set MAC_SIGN_IDENTITY or MAC_SIGN_CERTIFICATE in env or ~/.openfde/config/.env',
    )
  }
}

if (buildingWin) {
  if (isWindowsCodeSigningConfigured(signingEnv)) {
    console.log('[code-sign] Windows Authenticode signing configured')
  } else {
    console.log(
      '[code-sign] No Windows signing env found — build will be unsigned. Set WIN_SIGN_CERTIFICATE in env or ~/.openfde/config/.env',
    )
  }
}

const result = spawnSync('electron-builder', args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
