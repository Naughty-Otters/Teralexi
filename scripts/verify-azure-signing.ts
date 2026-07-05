/**
 * Verify Azure Trusted Signing env vars on macOS/Linux/Windows without building.
 *
 * Checks:
 *  1. All seven AZURE_* vars present + format (GUID, endpoint URL)
 *  2. OAuth client-credentials token for scope https://codesigning.azure.net/.default
 *  3. (Optional) ARM profile lookup when AZURE_SUBSCRIPTION_ID + AZURE_RESOURCE_GROUP are set
 *
 * Does NOT sign a file — TrustedSigning/signtool runs only on Windows CI/build.
 *
 * Usage:
 *   npm run verify:azure-signing
 *   tsx scripts/verify-azure-signing.ts
 *
 * Loads env/.signing.env then process env (same as build scripts).
 */
import {
  applyCodeSigningEnv,
  buildAzureTrustedSigningExtraArgs,
  formatAzureTrustedSigningValidationBanner,
  getAzureTrustedSigningEnv,
  inspectAzureTrustedSigningEnv,
} from '../config/code-signing-env'

const CODESIGNING_SCOPE = 'https://codesigning.azure.net/.default'
const MANAGEMENT_SCOPE = 'https://management.azure.com/.default'
const TOKEN_URL_TEMPLATE =
  'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'

type TokenResponse =
  | { access_token: string; token_type?: string; expires_in?: number }
  | { error: string; error_description?: string }

type ProbeResult = {
  level: 'ok' | 'warn' | 'fail'
  message: string
}

function redact(value: string | undefined, visible = 4): string {
  if (!value) return '(missing)'
  if (value.length <= visible * 2) return '***'
  return `${value.slice(0, visible)}…${value.slice(-visible)}`
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '')
}

async function fetchAccessToken(
  env: ReturnType<typeof getAzureTrustedSigningEnv>,
  scope: string,
): Promise<{ ok: boolean; message: string; accessToken?: string }> {
  const tenant = env.AZURE_TENANT_ID?.trim()
  const clientId = env.AZURE_CLIENT_ID?.trim()
  const clientSecret = env.AZURE_CLIENT_SECRET?.trim()
  if (!tenant || !clientId || !clientSecret) {
    return { ok: false, message: 'Missing tenant/client/secret for token request.' }
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope,
    grant_type: 'client_credentials',
  })

  const url = TOKEN_URL_TEMPLATE.replace('{tenant}', encodeURIComponent(tenant))
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (err) {
    return {
      ok: false,
      message: `Token request failed (network): ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const payload = (await response.json()) as TokenResponse
  if (!response.ok || !('access_token' in payload) || !payload.access_token) {
    const error = 'error' in payload ? payload.error : `HTTP ${response.status}`
    const detail =
      'error_description' in payload ? payload.error_description : response.statusText
    return {
      ok: false,
      message: `Entra token rejected for ${scope} (${error}): ${detail ?? 'no details'}`,
    }
  }

  return {
    ok: true,
    message: `Entra token OK for ${scope} (expires_in=${payload.expires_in ?? '?'})`,
    accessToken: payload.access_token,
  }
}

async function probeCertificateProfileViaArm(
  env: ReturnType<typeof getAzureTrustedSigningEnv>,
  accessToken: string,
): Promise<ProbeResult> {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID?.trim()
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP?.trim()
  if (!subscriptionId || !resourceGroup) {
    return {
      level: 'warn',
      message:
        'Skipped ARM profile lookup (set AZURE_SUBSCRIPTION_ID + AZURE_RESOURCE_GROUP in env/.signing.env to enable).',
    }
  }

  const account = env.AZURE_SIGNING_ACCOUNT_NAME!.trim()
  const profile = env.AZURE_SIGNING_CERTIFICATE_PROFILE!.trim()
  const url =
    `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}` +
    `/resourceGroups/${encodeURIComponent(resourceGroup)}` +
    `/providers/Microsoft.CodeSigning/codeSigningAccounts/${encodeURIComponent(account)}` +
    `/certificateProfiles/${encodeURIComponent(profile)}?api-version=2025-10-13`

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    return {
      level: 'fail',
      message: `ARM profile lookup failed (network): ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const body = await response.text()
  if (response.ok) {
    return {
      level: 'ok',
      message: `Certificate profile exists in Azure (subscription=${subscriptionId}, resourceGroup=${resourceGroup}).`,
    }
  }

  if (response.status === 403) {
    return {
      level: 'warn',
      message:
        'ARM profile lookup returned 403 — App Registration may need Reader on the subscription/resource group. ' +
        'Signing still uses the Artifact Signing Certificate Profile Signer role on the signing account.',
    }
  }

  if (response.status === 404) {
    return {
      level: 'fail',
      message:
        `Certificate profile not found in ARM (404). Check AZURE_SIGNING_ACCOUNT_NAME (${account}), ` +
        `AZURE_SIGNING_CERTIFICATE_PROFILE (${profile}), AZURE_SUBSCRIPTION_ID, and AZURE_RESOURCE_GROUP (${resourceGroup}).`,
    }
  }

  return {
    level: 'fail',
    message: `ARM profile lookup failed (HTTP ${response.status}): ${body.slice(0, 240) || 'empty body'}`,
  }
}

function printProbeResult(result: ProbeResult): boolean {
  const label = result.level === 'ok' ? 'OK' : result.level === 'warn' ? 'WARN' : 'FAIL'
  const printer =
    result.level === 'fail'
      ? console.error
      : result.level === 'warn'
        ? console.warn
        : console.log
  printer(`  ${label}: ${result.message}`)
  return result.level !== 'fail'
}

async function main(): Promise<void> {
  applyCodeSigningEnv()
  const azure = getAzureTrustedSigningEnv()
  const report = inspectAzureTrustedSigningEnv()

  console.log('[verify-azure-signing] Platform:', process.platform)
  console.log(formatAzureTrustedSigningValidationBanner(report))
  console.log('')

  console.log('[verify-azure-signing] Resolved values (secrets redacted):')
  console.log(`  AZURE_TENANT_ID: ${redact(azure.AZURE_TENANT_ID)}`)
  console.log(`  AZURE_CLIENT_ID: ${redact(azure.AZURE_CLIENT_ID)}`)
  console.log(`  AZURE_CLIENT_SECRET: ${azure.AZURE_CLIENT_SECRET ? '(present)' : 'MISSING'}`)
  console.log(`  AZURE_SIGNING_ENDPOINT: ${azure.AZURE_SIGNING_ENDPOINT ?? 'MISSING'}`)
  console.log(`  AZURE_SIGNING_ACCOUNT_NAME: ${azure.AZURE_SIGNING_ACCOUNT_NAME ?? 'MISSING'}`)
  console.log(
    `  AZURE_SIGNING_CERTIFICATE_PROFILE: ${azure.AZURE_SIGNING_CERTIFICATE_PROFILE ?? 'MISSING'}`,
  )
  console.log(`  AZURE_SIGNING_PUBLISHER_NAME: ${azure.AZURE_SIGNING_PUBLISHER_NAME ?? 'MISSING'}`)
  console.log('')

  if (!report.configured) {
    console.error('[verify-azure-signing] FAIL: fix missing/invalid variables above.')
    process.exit(1)
  }

  const extraArgs = buildAzureTrustedSigningExtraArgs()
  console.log('[verify-azure-signing] electron-builder overrides that would be passed:')
  for (const arg of extraArgs) console.log(`  ${arg}`)
  console.log('')

  console.log('[verify-azure-signing] Step 1/2: Entra client-credentials (codesigning scope)…')
  const tokenResult = await fetchAccessToken(azure, CODESIGNING_SCOPE)
  console.log(`  ${tokenResult.ok ? 'OK' : 'FAIL'}: ${tokenResult.message}`)
  if (!tokenResult.ok) {
    process.exit(1)
  }

  console.log('[verify-azure-signing] Step 2/2: Certificate profile (optional ARM lookup)…')
  const mgmtToken = await fetchAccessToken(azure, MANAGEMENT_SCOPE)
  let step2Ok = true
  if (!mgmtToken.ok) {
    step2Ok = printProbeResult({
      level: 'warn',
      message:
        `${mgmtToken.message} Skipping ARM profile lookup; confirm account/profile names in Azure Portal.`,
    })
  } else {
    step2Ok = printProbeResult(
      await probeCertificateProfileViaArm(azure, mgmtToken.accessToken!),
    )
  }

  console.log('')
  if (!step2Ok) {
    console.error('[verify-azure-signing] FAIL: fix account/profile or ARM access above.')
    process.exit(1)
  }

  console.log(
    '[verify-azure-signing] PASS: Entra credentials work for Artifact Signing.',
  )
  console.log(
    '[verify-azure-signing] Confirm account/profile names + Account URI in Azure Portal → Artifact Signing account → Overview.',
  )
  console.log(
    '[verify-azure-signing] If Windows CI still returns 403, assign "Artifact Signing Certificate Profile Signer" to your App Registration on that account.',
  )
  console.log(
    '[verify-azure-signing] Note: actual Authenticode signing still runs only on Windows (TrustedSigning + signtool).',
  )
}

void main()
