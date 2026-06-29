import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { GITHUB_REF, GITHUB_REF_NAME, GITHUB_EVENT_NAME, GITHUB_REPOSITORY } =
  process.env

if (!GITHUB_REF_NAME) {
  throw new Error('Missing GITHUB_REF_NAME')
}

const packageJsonPath = join(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const version = String(packageJson.version ?? '').trim()
const expectedTag = `v${version}`

if (!version) {
  throw new Error('package.json version is missing')
}

const isTagRef = GITHUB_REF?.startsWith('refs/tags/') ?? false

if (GITHUB_EVENT_NAME === 'workflow_dispatch' && !isTagRef) {
  const repo = GITHUB_REPOSITORY ? ` for ${GITHUB_REPOSITORY}` : ''
  console.log(
    `Manual production release from ${GITHUB_REF_NAME}; publishing v${version}${repo}`,
  )
  process.exit(0)
}

if (GITHUB_REF_NAME !== expectedTag) {
  throw new Error(
    `Release tag mismatch: expected ${expectedTag} from package.json, received ${GITHUB_REF_NAME}`,
  )
}

const repo = GITHUB_REPOSITORY ? ` for ${GITHUB_REPOSITORY}` : ''
console.log(`Verified release tag ${GITHUB_REF_NAME}${repo}`)
