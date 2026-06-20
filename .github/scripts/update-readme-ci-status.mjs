import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const {
  GITHUB_REPOSITORY,
  GITHUB_SHA,
  GITHUB_RUN_ID,
  GITHUB_REF_NAME,
  GITHUB_SERVER_URL = 'https://github.com',
} = process.env

if (!GITHUB_REPOSITORY || !GITHUB_SHA || !GITHUB_RUN_ID || !GITHUB_REF_NAME) {
  throw new Error('Missing required GitHub Actions environment variables')
}

const readmePath = join(process.cwd(), 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const shortSha = GITHUB_SHA.slice(0, 7)
const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

const block = `<!-- ci-status-start -->
[![CI](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/badge.svg)](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/workflows/ci.yml)

| | |
| --- | --- |
| **Last successful build** | ${timestamp} |
| **Branch** | \`${GITHUB_REF_NAME}\` |
| **Commit** | [\`${shortSha}\`](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/commit/${GITHUB_SHA}) |
| **Workflow run** | [View logs](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}) |
<!-- ci-status-end -->`

const updated = readme.replace(
  /<!-- ci-status-start -->[\s\S]*?<!-- ci-status-end -->/,
  block,
)

if (updated === readme) {
  throw new Error('Could not find CI status markers in README.md')
}

writeFileSync(readmePath, updated)
