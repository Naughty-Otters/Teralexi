import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { GITHUB_REF_NAME, GITHUB_REPOSITORY } = process.env

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

if (GITHUB_REF_NAME !== expectedTag) {
  throw new Error(
    `Release tag mismatch: expected ${expectedTag} from package.json, received ${GITHUB_REF_NAME}`,
  )
}

const repo = GITHUB_REPOSITORY ? ` for ${GITHUB_REPOSITORY}` : ''
console.log(`Verified release tag ${GITHUB_REF_NAME}${repo}`)
