import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { applyBuildEnvFromArgv, stripOpenFdeCliArgs } from '../.electron-vite/utils'
import {
  applyCodeSigningEnv,
  applyUnsignedPlatformBuildPolicy,
  buildElectronBuilderExtraArgs,
  isAzureTrustedSigningConfigured,
  isMacCodeSigningConfigured,
  isMacNotarizeConfigured,
  isWindowsCodeSigningConfigured,
  isWindowsPfxSigningConfigured,
  logAzureTrustedSigningValidation,
  logCodeSigningEnv,
} from '../config/code-signing-env'
import { detectElectronBuilderTargets } from '../config/electron-builder-targets'
import { resignUnsignedMacAppsInBuildOutput } from './macos-unsigned-resign'
import { generateSelfSignedWindowsCert } from './self-signed-win-cert'

applyBuildEnvFromArgv()

const userArgs = stripOpenFdeCliArgs(process.argv.slice(2))
const { buildingMac, buildingWin } = detectElectronBuilderTargets(userArgs)

const signingEnv = applyCodeSigningEnv()

// Report presence/absence of every required signing variable up front (before
// the self-signed fallback injects anything), so the log reflects real inputs.
logCodeSigningEnv(signingEnv, { buildingMac, buildingWin })

if (buildingWin) {
  logAzureTrustedSigningValidation(process.env)
}

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
  // Notarization without a Developer ID signature always fails with
  // "not signed with a valid Developer ID certificate" + "no secure timestamp".
  // Fail fast with an actionable message instead of the cryptic notary errors.
  if (isMacNotarizeConfigured(signingEnv) && !isMacCodeSigningConfigured(signingEnv)) {
    console.error(
      '[code-sign] ERROR: Apple notarization is configured but macOS signing is NOT.\n' +
        '           Notarization requires a Developer ID signature — an ad-hoc/unsigned app\n' +
        '           will be rejected ("not signed with a valid Developer ID certificate",\n' +
        '           "signature does not include a secure timestamp").\n' +
        "           Set MAC_SIGN_CERTIFICATE_BASE64 + MAC_SIGN_CERTIFICATE_PASSWORD (and optionally\n" +
        "           MAC_SIGN_IDENTITY) in the 'release' environment so the signing cert reaches this job.",
    )
    process.exit(1)
  }

  if (isMacCodeSigningConfigured(signingEnv)) {
    console.log('[code-sign] macOS signing configured (forceCodeSigning on — build fails if identity is unresolved)')
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
  if (isAzureTrustedSigningConfigured()) {
    console.log('[code-sign] Windows Azure Trusted Signing configured')
  } else if (isWindowsPfxSigningConfigured(signingEnv)) {
    console.log('[code-sign] Windows Authenticode signing configured (.pfx)')
  } else {
    console.log(
      '[code-sign] Windows unsigned build (signAndEditExecutable disabled). Set WIN_SIGN_CERTIFICATE or Azure Trusted Signing env vars to sign.',
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
