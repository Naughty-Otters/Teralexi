import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { applyBuildEnvFromArgv, stripOpenFdeCliArgs } from '../.electron-vite/utils'
import {
  applyCodeSigningEnv,
  applyUnsignedPlatformBuildPolicy,
  buildElectronBuilderExtraArgs,
  isMacCodeSigningConfigured,
  isMacNotarizeConfigured,
  isWindowsCodeSigningConfigured,
} from '../config/code-signing-env'
import { detectElectronBuilderTargets } from '../config/electron-builder-targets'
import { resignUnsignedMacAppsInBuildOutput } from './macos-unsigned-resign'
import { generateSelfSignedWindowsCert } from './self-signed-win-cert'

applyBuildEnvFromArgv()

const userArgs = stripOpenFdeCliArgs(process.argv.slice(2))
const { buildingMac, buildingWin } = detectElectronBuilderTargets(userArgs)

const signingEnv = applyCodeSigningEnv()

// Windows: when no real Authenticode cert is supplied, fall back to an
// ephemeral self-signed certificate so the build still produces a signed
// installer instead of failing. If generation fails, we drop through to the
// existing unsigned path (signAndEditExecutable disabled).
if (buildingWin && !isWindowsCodeSigningConfigured(signingEnv)) {
  const selfSigned = generateSelfSignedWindowsCert()
  if (selfSigned) {
    console.log(
      `[code-sign] Windows: no cert provided — using generated self-signed certificate (${selfSigned.pfxPath})`,
    )
    process.env.WIN_CSC_LINK = selfSigned.pfxPath
    process.env.WIN_CSC_KEY_PASSWORD = selfSigned.password
    signingEnv.set('WIN_CSC_LINK', selfSigned.pfxPath)
    signingEnv.set('WIN_CSC_KEY_PASSWORD', selfSigned.password)
    if (process.platform === 'win32') {
      process.env.CSC_LINK = selfSigned.pfxPath
      process.env.CSC_KEY_PASSWORD = selfSigned.password
    }
  } else {
    console.warn(
      '[code-sign] Windows: self-signed certificate generation failed — building unsigned.',
    )
  }
}

applyUnsignedPlatformBuildPolicy(process.env, signingEnv, {
  buildingMac,
  buildingWin,
})

const args = [
  ...userArgs,
  ...buildElectronBuilderExtraArgs(signingEnv, { buildingMac, buildingWin }),
]

if (buildingMac) {
  if (isMacCodeSigningConfigured(signingEnv)) {
    console.log('[code-sign] macOS signing configured')
    if (isMacNotarizeConfigured(signingEnv)) {
      console.log('[code-sign] Apple notarization enabled')
    }
  } else {
    console.log(
      '[code-sign] macOS unsigned build (hardenedRuntime disabled, post-build ad-hoc re-sign). Set MAC_SIGN_IDENTITY or MAC_SIGN_CERTIFICATE to sign.',
    )
  }
}

if (buildingWin) {
  if (isWindowsCodeSigningConfigured(signingEnv)) {
    console.log('[code-sign] Windows Authenticode signing configured')
  } else {
    console.log(
      '[code-sign] Windows unsigned build (signAndEditExecutable disabled). Set WIN_SIGN_CERTIFICATE to sign.',
    )
  }
}

const result = spawnSync('electron-builder', args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (buildingMac && !isMacCodeSigningConfigured(signingEnv)) {
  const buildDir = join(process.cwd(), 'build')
  const signedApps = resignUnsignedMacAppsInBuildOutput(buildDir)
  if (signedApps.length === 0) {
    console.warn(
      `[code-sign] expected a macOS .app under ${buildDir}/mac-* but none was found for post-build re-sign`,
    )
  } else {
    for (const appPath of signedApps) {
      console.log(`[code-sign] post-build ad-hoc re-signed: ${appPath}`)
    }
  }
}

process.exit(0)
