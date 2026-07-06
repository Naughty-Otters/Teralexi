#!/usr/bin/env node
/**
 * Verify code-signing / notarization of built artifacts.
 *
 * Runs the same checks documented in docs/CODE-SIGNING.md:
 *   macOS  → codesign --verify, codesign -dv, spctl --assess, stapler validate
 *   Windows→ Get-AuthenticodeSignature (+ signtool verify /pa when available)
 *
 * Usage:
 *   node scripts/verify-signing.mjs [--dir build] [--strict] [--json]
 *
 *   --dir <path>  Directory to scan for artifacts (default: build)
 *   --strict      Exit non-zero on warnings (unsigned / self-signed / unnotarized)
 *   --json        Emit a machine-readable JSON summary instead of text
 *
 * Exit codes: 0 = ok, 1 = a hard failure (or a warning when --strict), 2 = usage error.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const RESULT = { OK: 'ok', WARN: 'warn', FAIL: 'fail', SKIP: 'skip' }

function parseArgs(argv) {
  const args = { dir: 'build', strict: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') args.dir = argv[++i]
    else if (a === '--strict') args.strict = true
    else if (a === '--json') args.json = true
    else if (a === '-h' || a === '--help') args.help = true
    else {
      console.error(`Unknown argument: ${a}`)
      args.error = true
    }
  }
  return args
}

function run(cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, { encoding: 'utf-8' })
  return {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    combined: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    missing: res.error?.code === 'ENOENT',
  }
}

function hasCommand(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  return run(probe, [cmd]).status === 0
}

/** Recursively find .app bundles (dirs), .dmg, .zip, .exe under `dir`. */
function findArtifacts(dir) {
  const apps = []
  const dmgs = []
  const exes = []
  if (!existsSync(dir)) return { apps, dmgs, exes }

  const walk = (current, depth) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.app')) {
          apps.push(full)
          continue // don't descend into the bundle
        }
        // Avoid descending into intermediate electron-builder scratch dirs too deeply.
        if (depth < 4) walk(full, depth + 1)
      } else {
        const ext = extname(entry.name).toLowerCase()
        if (ext === '.dmg') dmgs.push(full)
        else if (ext === '.exe') exes.push(full)
      }
    }
  }
  walk(dir, 0)
  return { apps, dmgs, exes }
}

const checks = []
function record(artifact, name, result, detail) {
  checks.push({ artifact, name, result, detail })
}

// ── macOS ────────────────────────────────────────────────────────────────────

function verifyMacApp(appPath) {
  const rel = basename(appPath)

  // 1. Signature valid + complete
  const verify = run('codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appPath,
  ])
  if (verify.status === 0) {
    record(rel, 'codesign --verify', RESULT.OK, 'signature valid on disk')
  } else {
    record(rel, 'codesign --verify', RESULT.FAIL, verify.combined.trim().split('\n').pop())
  }

  // 2. Authority chain / ad-hoc detection
  const info = run('codesign', ['-dv', '--verbose=4', appPath])
  const text = info.combined
  const authorityLine = text
    .split('\n')
    .find((l) => l.startsWith('Authority='))
  const teamLine = text.split('\n').find((l) => l.startsWith('TeamIdentifier='))
  const isAdhoc = /Signature=adhoc/.test(text)
  const isDeveloperId = /Authority=Developer ID Application:/.test(text)

  if (isAdhoc) {
    record(rel, 'authority', RESULT.WARN, 'ad-hoc signature (not distributable)')
  } else if (isDeveloperId) {
    record(
      rel,
      'authority',
      RESULT.OK,
      `${authorityLine ?? 'Developer ID'}${teamLine ? ` / ${teamLine}` : ''}`,
    )
  } else if (authorityLine) {
    record(rel, 'authority', RESULT.WARN, `${authorityLine} (not Developer ID)`) 
  } else {
    record(rel, 'authority', RESULT.WARN, 'no authority found (unsigned/ad-hoc)')
  }

  // 3. Gatekeeper assessment
  const spctl = run('spctl', ['--assess', '--type', 'execute', '--verbose', appPath])
  const spctlText = spctl.combined
  if (spctl.status === 0 && /source=Notarized Developer ID/.test(spctlText)) {
    record(rel, 'spctl --assess', RESULT.OK, 'accepted (Notarized Developer ID)')
  } else if (spctl.status === 0) {
    record(rel, 'spctl --assess', RESULT.WARN, spctlText.trim().split('\n').pop())
  } else {
    record(rel, 'spctl --assess', RESULT.WARN, spctlText.trim().split('\n').pop() || 'rejected')
  }

  // 4. Notarization ticket stapled
  const staple = run('xcrun', ['stapler', 'validate', appPath])
  if (staple.status === 0) {
    record(rel, 'stapler validate', RESULT.OK, 'notarization ticket stapled')
  } else {
    record(rel, 'stapler validate', RESULT.WARN, 'no stapled ticket (not notarized)')
  }
}

function verifyMacContainer(path) {
  const rel = basename(path)
  const staple = run('xcrun', ['stapler', 'validate', path])
  if (staple.status === 0) {
    record(rel, 'stapler validate', RESULT.OK, 'notarization ticket stapled')
  } else {
    record(rel, 'stapler validate', RESULT.WARN, 'no stapled ticket (not notarized)')
  }
}

// ── Windows ────────────────────────────────────────────────────────────────

function verifyWinExe(exePath) {
  const rel = basename(exePath)

  const ps = run('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$s = Get-AuthenticodeSignature -FilePath '${exePath}'; ` +
      `Write-Output ("STATUS=" + $s.Status); ` +
      `Write-Output ("SUBJECT=" + $s.SignerCertificate.Subject)`,
  ])

  if (ps.missing) {
    record(rel, 'Get-AuthenticodeSignature', RESULT.SKIP, 'powershell not available on this host')
  } else {
    const statusMatch = ps.stdout.match(/STATUS=(.+)/)
    const subjectMatch = ps.stdout.match(/SUBJECT=(.+)/)
    const status = statusMatch?.[1]?.trim()
    const subject = subjectMatch?.[1]?.trim() ?? ''
    const isSelfSigned = /CN=Teralexi \(Self-Signed\)/i.test(subject)

    if (status === 'Valid') {
      record(rel, 'Authenticode', RESULT.OK, `Valid — ${subject}`)
    } else if (!status || status === 'NotSigned') {
      record(rel, 'Authenticode', RESULT.WARN, 'NotSigned (unsigned build)')
    } else if (isSelfSigned) {
      record(rel, 'Authenticode', RESULT.WARN, `${status} — self-signed (${subject})`)
    } else {
      record(rel, 'Authenticode', RESULT.WARN, `${status} — untrusted (${subject})`)
    }
  }

  if (hasCommand('signtool')) {
    const st = run('signtool', ['verify', '/pa', exePath])
    if (st.status === 0) {
      record(rel, 'signtool verify /pa', RESULT.OK, 'chain trusted')
    } else {
      record(rel, 'signtool verify /pa', RESULT.WARN, 'chain not trusted (self-signed/unsigned)')
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) process.exit(2)
  if (args.help) {
    console.log(
      'Usage: node scripts/verify-signing.mjs [--dir build] [--strict] [--json]',
    )
    process.exit(0)
  }

  if (!existsSync(args.dir)) {
    console.error(`[verify-signing] build directory not found: ${args.dir}`)
    process.exit(2)
  }

  const { apps, dmgs, exes } = findArtifacts(args.dir)
  const total = apps.length + dmgs.length + exes.length
  if (total === 0) {
    console.error(`[verify-signing] no .app/.dmg/.exe artifacts found under ${args.dir}`)
    process.exit(2)
  }

  const onMac = process.platform === 'darwin'
  const canCodesign = onMac && hasCommand('codesign')

  if (apps.length && !canCodesign) {
    for (const app of apps)
      record(basename(app), 'macOS checks', RESULT.SKIP, 'codesign only runs on macOS')
  } else {
    for (const app of apps) verifyMacApp(app)
    for (const dmg of dmgs) verifyMacContainer(dmg)
  }
  if (dmgs.length && !canCodesign) {
    for (const dmg of dmgs)
      record(basename(dmg), 'stapler validate', RESULT.SKIP, 'requires macOS')
  }

  for (const exe of exes) verifyWinExe(exe)

  if (args.json) {
    console.log(JSON.stringify({ artifacts: { apps, dmgs, exes }, checks }, null, 2))
  } else {
    printText({ apps, dmgs, exes })
  }

  const failed = checks.some((c) => c.result === RESULT.FAIL)
  const warned = checks.some((c) => c.result === RESULT.WARN)
  if (failed || (args.strict && warned)) process.exit(1)
  process.exit(0)
}

function icon(result) {
  return { ok: '✓', warn: '!', fail: '✗', skip: '-' }[result] ?? '?'
}

function printText({ apps, dmgs, exes }) {
  console.log(`\n[verify-signing] platform=${process.platform}`)
  console.log(
    `[verify-signing] found ${apps.length} app, ${dmgs.length} dmg, ${exes.length} exe\n`,
  )
  let current = null
  for (const c of checks) {
    if (c.artifact !== current) {
      current = c.artifact
      console.log(current)
    }
    console.log(`  [${icon(c.result)}] ${c.name}: ${c.detail ?? ''}`)
  }
  const counts = checks.reduce((acc, c) => {
    acc[c.result] = (acc[c.result] ?? 0) + 1
    return acc
  }, {})
  console.log(
    `\nSummary: ${counts.ok ?? 0} ok, ${counts.warn ?? 0} warn, ${counts.fail ?? 0} fail, ${counts.skip ?? 0} skip`,
  )
}

main()
