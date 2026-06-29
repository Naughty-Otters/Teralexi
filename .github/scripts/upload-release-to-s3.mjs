#!/usr/bin/env node
/**
 * Upload electron-builder release artifacts to a private S3 prefix.
 * Intended for GitHub Actions — credentials via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const buildDir = process.argv[2] || 'build'
const bucket = process.env.S3_RELEASE_BUCKET?.trim()
const prefix = (process.env.S3_RELEASE_PREFIX || 'desktop/releases/stable').replace(
  /^\/+|\/+$/g,
  '',
)

if (!bucket) {
  console.error('S3_RELEASE_BUCKET is required')
  process.exit(1)
}

const FEED_FILES = /^latest(-mac|-linux)?\.yml$/i
const ARTIFACT_EXT = /\.(exe|zip|dmg|blockmap|yml)$/i

function shouldUpload(name) {
  return FEED_FILES.test(name) || ARTIFACT_EXT.test(name)
}

function contentTypeFor(name) {
  if (/\.ya?ml$/i.test(name)) return 'application/x-yaml'
  return undefined
}

const files = readdirSync(buildDir).filter((name) => {
  const fullPath = join(buildDir, name)
  return statSync(fullPath).isFile() && shouldUpload(name)
})

if (files.length === 0) {
  console.error(`No release artifacts found under ${buildDir}`)
  process.exit(1)
}

for (const name of files) {
  const local = join(buildDir, name)
  const dest = `s3://${bucket}/${prefix}/${name}`
  const args = ['s3', 'cp', local, dest]
  const contentType = contentTypeFor(name)
  if (contentType) {
    args.push('--content-type', contentType)
  }
  console.log(`Uploading ${local} -> ${dest}`)
  execFileSync('aws', args, { stdio: 'inherit' })
}

console.log(`Uploaded ${files.length} file(s) to s3://${bucket}/${prefix}/`)
