#!/usr/bin/env node
/**
 * Point git at the repo-tracked hooks in `.githooks` so the pre-push guard
 * (unit tests + coverage) runs for everyone after `npm install`.
 *
 * Intentionally non-fatal: CI, tarball installs, and non-git checkouts should
 * never fail `npm install` just because hooks could not be configured.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
}

try {
  if (process.env.CI) {
    process.exit(0)
  }
  if (!existsSync(join(repoRoot, '.git')) && !existsSync(join(repoRoot, '.githooks'))) {
    process.exit(0)
  }
  const insideRepo = run(['rev-parse', '--is-inside-work-tree'])
  if (insideRepo !== 'true') {
    process.exit(0)
  }
  run(['config', 'core.hooksPath', '.githooks'])
  console.log('[setup-git-hooks] core.hooksPath set to .githooks')
} catch {
  // Non-fatal — hooks are a convenience, not a build requirement.
}
