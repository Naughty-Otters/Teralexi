import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'
import { createLogger } from '@main/logger'

const execFileAsync = promisify(execFile)
const log = createLogger('toolSet:ripgrep')

export interface RipgrepMatch {
  path: string
  lineNumber: number
  line: string
}

export type RipgrepJsonResult = {
  matches: RipgrepMatch[]
  available: boolean
  /** Set when `available` is false (missing binary, exec error, etc.). */
  error?: string
}

export type RipgrepFilesResult = {
  paths: string[]
  available: boolean
  error?: string
}

function formatExecError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** Resolve ripgrep output paths (cwd-relative) to absolute paths for tool round-trip. */
function toAbsoluteRipgrepPath(cwd: string, filePath: string): string {
  const trimmed = filePath.trim()
  if (!trimmed) return trimmed
  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(cwd, trimmed)
}

export async function isRipgrepAvailable(): Promise<boolean> {
  try {
    await execFileAsync('rg', ['--version'], { maxBuffer: 1024 * 1024 })
    log.debug('ripgrep availability check: available')
    return true
  } catch (err) {
    log.warn('ripgrep availability check: not available', {
      error: formatExecError(err),
    })
    return false
  }
}

export async function runRipgrepJson(
  args: string[],
  cwd: string,
): Promise<RipgrepJsonResult> {
  try {
    const { stdout } = await execFileAsync('rg', ['--json', ...args], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    })

    const matches: RipgrepMatch[] = []
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as {
          type?: string
          data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } }
        }
        if (event.type === 'match' && event.data?.path?.text) {
          matches.push({
            path: event.data.path.text,
            lineNumber: event.data.line_number ?? 0,
            line: event.data.lines?.text?.replace(/\n$/, '') ?? '',
          })
        }
      } catch {
        // skip malformed json lines
      }
    }

    log.info('ripgrep content search completed', {
      cwd,
      args,
      matchCount: matches.length,
    })
    return { matches, available: true }
  } catch (err) {
    const error = formatExecError(err)
    log.warn('ripgrep content search failed; use Node fallback', {
      cwd,
      args,
      error,
    })
    return { matches: [], available: false, error }
  }
}

export async function runRipgrepFiles(
  args: string[],
  cwd: string,
): Promise<RipgrepFilesResult> {
  try {
    const { stdout } = await execFileAsync('rg', ['--files', ...args], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    const paths = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((rel) => toAbsoluteRipgrepPath(cwd, rel))

    log.info('ripgrep file listing completed', {
      cwd,
      args,
      pathCount: paths.length,
    })
    return { paths, available: true }
  } catch (err) {
    const error = formatExecError(err)
    log.warn('ripgrep --files failed; use Node fallback', {
      cwd,
      args,
      error,
    })
    return { paths: [], available: false, error }
  }
}
