#!/usr/bin/env node
/**
 * Debug helper for Release OIDC assume-role failures.
 * Fetches a GitHub Actions OIDC token and prints non-secret JWT claims
 * so the IAM trust-policy `sub` / `aud` can be compared exactly.
 *
 * Does not print the raw JWT or AWS secret values.
 */
import { writeFileSync } from 'node:fs'

function decodeJwtPayload(token) {
  const parts = token.split('.')
  if (parts.length < 2) {
    throw new Error('OIDC response did not look like a JWT')
  }
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
}

function describeRoleSecret(value) {
  const raw = typeof value === 'string' ? value : ''
  const trimmed = raw.trim()
  return {
    present: trimmed.length > 0,
    length: trimmed.length,
    hadLeadingOrTrailingWhitespace: raw.length !== trimmed.length,
    looksLikeArn: trimmed.startsWith('arn:'),
    looksLikeIamRoleArn: /^arn:aws:iam::\d{12}:role\//.test(trimmed),
    colonCount: (trimmed.match(/:/g) || []).length,
    // Safe: only the suffix after ":role/" when ARN-shaped (role names are not secrets).
    roleNameSuffix: trimmed.includes(':role/')
      ? trimmed.slice(trimmed.indexOf(':role/') + ':role/'.length)
      : null,
  }
}

async function fetchOidcToken(audience) {
  const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!reqUrl || !reqToken) {
    throw new Error(
      'Missing ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN (need permissions.id-token: write)',
    )
  }
  const url = new URL(reqUrl)
  url.searchParams.set('audience', audience)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${reqToken}`,
      Accept: 'application/json; api-version=2.0',
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`OIDC token request failed: HTTP ${res.status}`)
  }
  const body = await res.json()
  if (!body?.value || typeof body.value !== 'string') {
    throw new Error('OIDC token response missing value')
  }
  return body.value
}

const audience = process.env.OIDC_AUDIENCE || 'sts.amazonaws.com'
const token = await fetchOidcToken(audience)
const claims = decodeJwtPayload(token)

const interesting = {
  iss: claims.iss,
  aud: claims.aud,
  sub: claims.sub,
  repository: claims.repository,
  repository_owner: claims.repository_owner,
  repository_id: claims.repository_id,
  repository_owner_id: claims.repository_owner_id,
  ref: claims.ref,
  sha: claims.sha,
  workflow: claims.workflow,
  workflow_ref: claims.workflow_ref,
  job_workflow_ref: claims.job_workflow_ref,
  runner_environment: claims.runner_environment,
  event_name: claims.event_name,
  environment: claims.environment,
  environment_node_id: claims.environment_node_id,
  actor: claims.actor,
  nbf: claims.nbf,
  exp: claims.exp,
  iat: claims.iat,
}

const githubCtx = {
  repository: process.env.GITHUB_REPOSITORY,
  ref: process.env.GITHUB_REF,
  ref_name: process.env.GITHUB_REF_NAME,
  workflow: process.env.GITHUB_WORKFLOW,
  job: process.env.GITHUB_JOB,
  run_id: process.env.GITHUB_RUN_ID,
  environment: process.env.GITHUB_ENVIRONMENT || '(unset — check job.environment)',
  event_name: process.env.GITHUB_EVENT_NAME,
  actor: process.env.GITHUB_ACTOR,
}

const roleInfo = describeRoleSecret(process.env.AWS_ROLE_TO_ASSUME_VALUE)
const regionInfo = {
  present: Boolean(process.env.AWS_REGION_VALUE?.trim()),
  length: process.env.AWS_REGION_VALUE?.trim().length ?? 0,
  hadWhitespace:
    (process.env.AWS_REGION_VALUE?.length ?? 0) !==
    (process.env.AWS_REGION_VALUE?.trim().length ?? 0),
}

const report = {
  audienceRequested: audience,
  githubContext: githubCtx,
  oidcClaims: interesting,
  awsRoleSecretShape: roleInfo,
  awsRegionSecretShape: regionInfo,
  trustPolicyHint: {
    expectedSubExact: claims.sub,
    expectedSubWildcard: typeof claims.sub === 'string'
      ? claims.sub.replace(/:[^:]+$/, ':*')
      : null,
    note:
      'IAM trust StringLike/StringEquals on token.actions.githubusercontent.com:sub must match oidcClaims.sub exactly. Some orgs emit owner/repo @numericId in sub (e.g. repo:Org@123/Repo@456:environment:release) — copy from oidcClaims.sub, do not invent the format.',
  },
}

const text = JSON.stringify(report, null, 2)
console.log(text)
writeFileSync('oidc-debug.json', text)
console.log('\nWrote oidc-debug.json (safe claims only; no raw JWT).')
