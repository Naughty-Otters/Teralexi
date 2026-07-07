const { spawnSync } = require('node:child_process')
const path = require('node:path')
const promiseRetry = require('promise-retry')
const { checkSignatures } = require('@electron/notarize/lib/check-signature')
const {
  isNotaryToolAvailable,
  notarizeAndWaitForNotaryTool,
} = require('@electron/notarize/lib/notarytool')

const STAPLE_RETRIES = 12
const STAPLE_MIN_TIMEOUT_MS = 20_000
const STAPLE_MAX_TIMEOUT_MS = 120_000

function isMacNotarizeConfigured(env = process.env) {
  const appleId = env.APPLE_ID?.trim()
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD?.trim()
  const teamId = env.APPLE_TEAM_ID?.trim()
  if (appleId || appleIdPassword || teamId) {
    return Boolean(appleId && appleIdPassword && teamId)
  }

  const appleApiKey = env.APPLE_API_KEY?.trim()
  const appleApiKeyId = env.APPLE_API_KEY_ID?.trim()
  const appleApiIssuer = env.APPLE_API_ISSUER?.trim()
  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    return Boolean(appleApiKey && appleApiKeyId && appleApiIssuer)
  }

  return Boolean(env.APPLE_KEYCHAIN_PROFILE?.trim())
}

function getNotarizeOptions(appPath, env = process.env) {
  const teamId = env.APPLE_TEAM_ID?.trim()
  const appleId = env.APPLE_ID?.trim()
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD?.trim()
  const tool = 'notarytool'

  if (appleId || appleIdPassword || teamId) {
    if (!appleId || !appleIdPassword || !teamId) {
      throw new Error(
        'APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID must all be set for macOS notarization',
      )
    }
    return { tool, appPath, appleId, appleIdPassword, teamId }
  }

  const appleApiKey = env.APPLE_API_KEY?.trim()
  const appleApiKeyId = env.APPLE_API_KEY_ID?.trim()
  const appleApiIssuer = env.APPLE_API_ISSUER?.trim()
  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error(
        'APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER must all be set for macOS notarization',
      )
    }
    return { tool, appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
  }

  const keychainProfile = env.APPLE_KEYCHAIN_PROFILE?.trim()
  if (keychainProfile) {
    const options = { tool, appPath, keychainProfile }
    const keychain = env.APPLE_KEYCHAIN?.trim()
    if (keychain) options.keychain = keychain
    return options
  }

  return null
}

function runStapler(appPath) {
  const result = spawnSync(
    'xcrun',
    ['stapler', 'staple', '-v', path.basename(appPath)],
    {
      cwd: path.dirname(appPath),
      encoding: 'utf8',
    },
  )
  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

function isStapled(appPath) {
  const result = spawnSync('xcrun', ['stapler', 'validate', appPath], {
    encoding: 'utf8',
  })
  return result.status === 0
}

async function stapleMacAppWithRetry(appPath) {
  if (isStapled(appPath)) {
    console.log(`[notarize] notarization ticket already stapled: ${appPath}`)
    return
  }

  await promiseRetry(
    async (retry, attemptNumber) => {
      console.log(
        `[notarize] stapling notarization ticket (attempt ${attemptNumber}/${STAPLE_RETRIES + 1}): ${appPath}`,
      )
      const result = runStapler(appPath)
      if (result.code !== 0) {
        retry(
          new Error(
            `Failed to staple your application with code: ${result.code}\n\n${result.output}`,
          ),
        )
      }
    },
    {
      retries: STAPLE_RETRIES,
      minTimeout: STAPLE_MIN_TIMEOUT_MS,
      maxTimeout: STAPLE_MAX_TIMEOUT_MS,
      factor: 1.4,
    },
  )

  console.log(`[notarize] staple succeeded: ${appPath}`)
}

async function notarizeMacAppWithResilientStaple(appPath) {
  const options = getNotarizeOptions(appPath)
  if (!options) return

  await checkSignatures({ appPath })

  if (!(await isNotaryToolAvailable())) {
    throw new Error(
      'notarytool is not available — install Xcode 13+ command line tools',
    )
  }

  console.log(`[notarize] submitting app to Apple notary service: ${appPath}`)
  await notarizeAndWaitForNotaryTool(options)
  console.log('[notarize] Apple notarization accepted; stapling ticket...')
  await stapleMacAppWithRetry(appPath)
  console.log('[notarize] notarization successful')
}

module.exports = {
  STAPLE_MAX_TIMEOUT_MS,
  STAPLE_MIN_TIMEOUT_MS,
  STAPLE_RETRIES,
  getNotarizeOptions,
  isMacNotarizeConfigured,
  isStapled,
  notarizeMacAppWithResilientStaple,
  stapleMacAppWithRetry,
}
