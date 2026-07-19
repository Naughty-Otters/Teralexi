import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { GITHUB_SHA, GITHUB_REF_NAME, GH_TOKEN, GITHUB_TOKEN } = process.env

if (!GITHUB_SHA) {
  throw new Error('Missing GITHUB_SHA')
}

if (!(GH_TOKEN || GITHUB_TOKEN)) {
  throw new Error('Missing GH_TOKEN / GITHUB_TOKEN')
}

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
)
const version = String(packageJson.version ?? '').trim()
if (!version) {
  throw new Error('package.json version is missing')
}

const tag = `v${version}`

function gh(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
  } catch (error) {
    if (allowFailure) return null
    const stderr = error?.stderr?.toString?.() || error?.message || String(error)
    throw new Error(`gh ${args.join(' ')} failed: ${stderr}`)
  }
}

const existing = gh(['release', 'view', tag], { allowFailure: true })
if (existing !== null) {
  console.log(
    `GitHub release ${tag} already exists (triggered from ${GITHUB_REF_NAME ?? 'unknown'}); leaving it unchanged.`,
  )
  process.exit(0)
}

gh([
  'release',
  'create',
  tag,
  '--title',
  tag,
  '--generate-notes',
  '--target',
  GITHUB_SHA,
])

console.log(`Created GitHub release ${tag} at ${GITHUB_SHA}`)
