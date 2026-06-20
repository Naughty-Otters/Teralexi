import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { NormalizedScriptType } from './run-script-types'

const execFileAsync = promisify(execFile)

export type PreflightIssue = {
  code: string
  message: string
}

export type ScriptPreflightResult =
  | { ok: true }
  | {
      ok: false
      phase: 'preflight'
      issues: PreflightIssue[]
    }

const PREFLIGHT_TIMEOUT_MS = 15_000

async function runSyntaxCheck(
  scriptType: NormalizedScriptType,
  scriptPath: string,
): Promise<PreflightIssue | null> {
  try {
    if (scriptType === 'bash') {
      if (process.platform === 'win32') {
        return null
      }
      await execFileAsync('bash', ['-n', scriptPath], {
        timeout: PREFLIGHT_TIMEOUT_MS,
        windowsHide: true,
      })
      return null
    }
    if (scriptType === 'python') {
      try {
        await execFileAsync('python3', ['-m', 'py_compile', scriptPath], {
          timeout: PREFLIGHT_TIMEOUT_MS,
          windowsHide: true,
        })
        return null
      } catch {
        await execFileAsync('python', ['-m', 'py_compile', scriptPath], {
          timeout: PREFLIGHT_TIMEOUT_MS,
          windowsHide: true,
        })
        return null
      }
    }
    try {
      await execFileAsync('node', ['--check', scriptPath], {
        timeout: PREFLIGHT_TIMEOUT_MS,
        windowsHide: true,
      })
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        code: 'syntax',
        message: `Node syntax check failed: ${msg}`,
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      code: 'syntax',
      message: `Syntax check failed: ${msg}`,
    }
  }
}

export async function runScriptPreflight(options: {
  scriptType: NormalizedScriptType
  scriptPath: string
  sandboxRoot: string
  resolveResultFileAbs?: (rel: string) => string | null
  resultFileRelativePath?: string
}): Promise<ScriptPreflightResult> {
  const issues: PreflightIssue[] = []

  try {
    await import('fs/promises').then((fs) => fs.access(options.scriptPath))
  } catch {
    issues.push({
      code: 'script_missing',
      message: `Script file not readable: ${options.scriptPath}`,
    })
    return { ok: false, phase: 'preflight', issues }
  }

  const syntaxIssue = await runSyntaxCheck(options.scriptType, options.scriptPath)
  if (syntaxIssue) issues.push(syntaxIssue)

  const resultRel = options.resultFileRelativePath?.trim()
  if (resultRel && options.resolveResultFileAbs) {
    const abs = options.resolveResultFileAbs(resultRel)
    if (!abs) {
      issues.push({
        code: 'result_path',
        message: `resultFileRelativePath is not a valid sandbox path: ${resultRel}`,
      })
    } else {
      const parent = path.dirname(abs)
      try {
        await import('fs/promises').then((fs) =>
          fs.mkdir(parent, { recursive: true }),
        )
      } catch (err) {
        issues.push({
          code: 'result_path',
          message: `Cannot create parent dir for result file: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, phase: 'preflight', issues }
  }
  return { ok: true }
}
