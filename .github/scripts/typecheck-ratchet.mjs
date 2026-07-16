#!/usr/bin/env node
/**
 * Advisory TypeScript ratchet: fail CI only when `tsc --noEmit` error count
 * increases above `.typescript-error-baseline`. Does not require a clean typecheck.
 *
 * Usage:
 *   node .github/scripts/typecheck-ratchet.mjs
 *   node .github/scripts/typecheck-ratchet.mjs --update
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const baselinePath = join(root, '.typescript-error-baseline')
const update = process.argv.includes('--update')

function countErrors(tscOutput) {
  const matches = tscOutput.match(/error TS\d+/g)
  return matches ? matches.length : 0
}

function readBaseline() {
  if (!existsSync(baselinePath)) {
    throw new Error(
      `Missing ${baselinePath}. Run: node .github/scripts/typecheck-ratchet.mjs --update`,
    )
  }
  const raw = readFileSync(baselinePath, 'utf8').trim()
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid baseline in ${baselinePath}: ${JSON.stringify(raw)}`)
  }
  return n
}

const result = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  shell: process.platform === 'win32',
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const errors = countErrors(output)

if (update) {
  writeFileSync(baselinePath, `${errors}\n`, 'utf8')
  console.log(`Updated baseline to ${errors} TypeScript errors.`)
  process.exit(0)
}

const baseline = readBaseline()
console.log(`TypeScript errors: ${errors} (baseline ${baseline})`)

if (errors > baseline) {
  console.error(
    `Typecheck ratchet failed: ${errors} errors exceeds baseline ${baseline}.`,
  )
  console.error(
    'Fix new type errors, or intentionally raise the baseline with:',
  )
  console.error('  node .github/scripts/typecheck-ratchet.mjs --update')
  // Show a short sample so CI logs are useful without dumping the full output.
  const lines = output.split('\n').filter((l) => /error TS\d+/.test(l)).slice(0, 40)
  if (lines.length) {
    console.error('\nSample new/remaining diagnostics:')
    for (const line of lines) console.error(line)
  }
  process.exit(1)
}

if (errors < baseline) {
  console.log(
    `Typecheck debt decreased by ${baseline - errors}. Consider updating the baseline:`,
  )
  console.log('  node .github/scripts/typecheck-ratchet.mjs --update')
}

process.exit(0)
