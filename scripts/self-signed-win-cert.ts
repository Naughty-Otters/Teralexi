import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

export interface GeneratedWinCert {
  /** Absolute path to the exported PKCS#12 (.pfx) bundle. */
  pfxPath: string
  /** Password protecting the .pfx. */
  password: string
}

const SUBJECT_CN = 'OpenFDE (Self-Signed)'

function randomPassword(): string {
  return randomBytes(18).toString('base64url')
}

/**
 * Generate a self-signed code-signing cert on Windows via PowerShell.
 * This is the reliable path on GitHub `windows-latest` runners because the
 * resulting .pfx is written by CryptoAPI and read back by signtool.exe.
 */
function generateWithPowerShell(
  pfxPath: string,
  password: string,
): boolean {
  const script = [
    '$ErrorActionPreference = "Stop"',
    `$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=${SUBJECT_CN}" -CertStoreLocation "Cert:\\CurrentUser\\My" -KeyUsage DigitalSignature -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5)`,
    `$pwd = ConvertTo-SecureString -String "${password}" -Force -AsPlainText`,
    `Export-PfxCertificate -Cert $cert -FilePath "${pfxPath}" -Password $pwd | Out-Null`,
    `Remove-Item -Path ("Cert:\\CurrentUser\\My\\" + $cert.Thumbprint) -Force`,
  ].join('; ')

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { stdio: 'inherit' },
  )
  return result.status === 0 && existsSync(pfxPath)
}

/**
 * Cross-platform fallback via OpenSSL (used for local dev on macOS/Linux).
 * Uses legacy PKCS#12 algorithms so Windows tooling can read the bundle.
 */
function generateWithOpenSsl(pfxPath: string, password: string): boolean {
  const dir = join(pfxPath, '..')
  const keyPath = join(dir, 'self-signed-win.key')
  const crtPath = join(dir, 'self-signed-win.crt')

  const req = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '1825',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      crtPath,
      '-subj',
      `/CN=${SUBJECT_CN}`,
      '-addext',
      'extendedKeyUsage=codeSigning',
    ],
    { stdio: 'inherit' },
  )
  if (req.status !== 0) return false

  const runPkcs12 = (extraArgs: string[]) =>
    spawnSync(
      'openssl',
      [
        'pkcs12',
        '-export',
        '-out',
        pfxPath,
        '-inkey',
        keyPath,
        '-in',
        crtPath,
        '-passout',
        `pass:${password}`,
        ...extraArgs,
      ],
      { stdio: 'inherit' },
    )

  // Prefer legacy encryption (readable by Windows); retry without it on
  // OpenSSL builds that do not support the flag.
  let pkcs12 = runPkcs12(['-legacy'])
  if (pkcs12.status !== 0) {
    pkcs12 = runPkcs12([])
  }

  rmSync(keyPath, { force: true })
  rmSync(crtPath, { force: true })
  return pkcs12.status === 0 && existsSync(pfxPath)
}

/**
 * Best-effort self-signed Windows code-signing certificate.
 *
 * Returns the generated .pfx path + password, or `null` if generation failed
 * (callers should then fall back to an unsigned build rather than failing).
 */
export function generateSelfSignedWindowsCert(
  cwd: string = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): GeneratedWinCert | null {
  try {
    const outDir = join(cwd, 'build', '.self-signed')
    mkdirSync(outDir, { recursive: true })
    const pfxPath = join(outDir, 'openfde-win-self-signed.pfx')
    rmSync(pfxPath, { force: true })

    const password = randomPassword()
    const ok =
      platform === 'win32'
        ? generateWithPowerShell(pfxPath, password)
        : generateWithOpenSsl(pfxPath, password)

    if (!ok) return null
    return { pfxPath, password }
  } catch {
    return null
  }
}
