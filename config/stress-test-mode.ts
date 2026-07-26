/**
 * Stress-test harness gate. Enabled only when explicitly launched with
 * `TERALEXI_STRESS_TEST=1` (or true/yes) and/or CLI `--stress-test`.
 */

let argvParsed = false
let argvStressEnabled = false
let argvDurationRaw: string | undefined

function truthyEnv(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function parseArgvOnce(): void {
  if (argvParsed) return
  argvParsed = true
  const argv = typeof process !== 'undefined' ? process.argv ?? [] : []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--stress-test') {
      argvStressEnabled = true
      continue
    }
    if (arg.startsWith('--stress-test=')) {
      argvStressEnabled = truthyEnv(arg.slice('--stress-test='.length))
      continue
    }
    if (arg === '--stress-duration' && argv[i + 1]) {
      argvDurationRaw = argv[++i]
      continue
    }
    if (arg.startsWith('--stress-duration=')) {
      argvDurationRaw = arg.slice('--stress-duration='.length)
    }
  }
}

/** True when the Stress Test UI and harness may run. */
export function isStressTestEnabled(): boolean {
  parseArgvOnce()
  return truthyEnv(process.env.TERALEXI_STRESS_TEST) || argvStressEnabled
}

/**
 * Parse duration strings like `30m`, `2h`, `10h`, or bare milliseconds.
 * Returns ms, or null if invalid.
 */
export function parseStressDurationMs(raw: string | undefined | null): number | null {
  if (raw == null) return null
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2]
  const mult =
    unit === 'ms'
      ? 1
      : unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000
  return Math.round(n * mult)
}

/** Default soak length when none specified (10 hours). */
export const DEFAULT_STRESS_DURATION_MS = 10 * 60 * 60 * 1000

/**
 * Resolve launch-time duration override from env / CLI.
 * Falls back to {@link DEFAULT_STRESS_DURATION_MS}.
 */
export function resolveStressDurationMs(
  override?: string | null,
): number {
  parseArgvOnce()
  const fromOverride = parseStressDurationMs(override)
  if (fromOverride != null) return fromOverride
  const fromEnv = parseStressDurationMs(process.env.TERALEXI_STRESS_DURATION)
  if (fromEnv != null) return fromEnv
  const fromArgv = parseStressDurationMs(argvDurationRaw)
  if (fromArgv != null) return fromArgv
  return DEFAULT_STRESS_DURATION_MS
}

/** Test helper: reset argv cache between unit tests. */
export function resetStressTestArgvCacheForTests(): void {
  argvParsed = false
  argvStressEnabled = false
  argvDurationRaw = undefined
}
