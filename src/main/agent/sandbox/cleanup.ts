import { realpathSync } from 'fs'
import { rm } from 'fs/promises'
import os from 'os'
import { basename, dirname, relative, resolve, sep } from 'path'
import { getopenfdeSandboxDir } from '@config/openfde-home'
import { isSubAgentSandboxRoot } from './sub-agent-registry'
import { createLogger, traceFunction } from '@main/logger'

const log = createLogger('sandbox.cleanup')

/**
 * Resolve to a canonical path; if the path does not exist, keep `resolve()` output.
 * Needed on macOS where `/var` vs `/private/var` breaks naive `path.relative` checks.
 */
function realpathSafe(p: string): string {
  const r = resolve(p.trim())
  try {
    return realpathSync(r)
  } catch {
    return r
  }
}

/**
 * Allows removal for sandboxes under `~/.openfde/workspace/sandbox/`, or legacy
 * `openfde-sandbox-*` folders directly under the OS tmpdir.
 */
function isRemovableopenfdeSandboxPathImpl(candidatePath: string): boolean {
  const openfdeSandboxReal = realpathSafe(getopenfdeSandboxDir())
  const tmpReal = realpathSafe(os.tmpdir())

  let parentReal: string
  let name: string

  try {
    const absReal = realpathSync(resolve(candidatePath.trim()))
    parentReal = dirname(absReal)
    name = basename(absReal)
  } catch {
    const abs = resolve(candidatePath.trim())
    name = basename(abs)
    parentReal = realpathSafe(dirname(abs))
  }

  if (parentReal === openfdeSandboxReal) return true

  // sandbox/sub-agents/sub-agent-<id>/ — nested under openfde sandbox dir
  try {
    const absReal = realpathSync(resolve(candidatePath.trim()))
    const rel = relative(openfdeSandboxReal, absReal)
    if (
      rel &&
      !rel.startsWith('..') &&
      !rel.startsWith(`..${sep}`) &&
      (rel.startsWith('sub-agents') || rel.includes('/sub-agents/'))
    ) {
      return true
    }
  } catch {
    if (isSubAgentSandboxRoot(candidatePath)) return true
  }

  if (!name.startsWith('openfde-sandbox-')) return false

  return parentReal === tmpReal
}

async function removeSandboxDirectoriesImpl(paths: string[]): Promise<void> {
  for (const p of paths) {
    const abs = resolve(p.trim())
    if (!isRemovableopenfdeSandboxPath(abs)) {
      log.warn('Skipped sandbox removal outside allowed sandbox roots', {
        path: p,
        openfdeSandbox: getopenfdeSandboxDir(),
        tmpdir: os.tmpdir(),
      })
      continue
    }
    try {
      await rm(abs, { recursive: true, force: true })
      log.info('Removed sandbox directory', { path: abs })
    } catch (err) {
      log.error('Failed to remove sandbox directory', {
        path: abs,
        err,
      })
    }
  }
}

export const isRemovableopenfdeSandboxPath = traceFunction(
  log,
  'isRemovableopenfdeSandboxPath',
  isRemovableopenfdeSandboxPathImpl,
)

export const removeSandboxDirectories = traceFunction(
  log,
  'removeSandboxDirectories',
  removeSandboxDirectoriesImpl,
)
