import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const summaryPath =
  process.argv[2] || join(process.cwd(), 'coverage', 'coverage-summary.json')
const outPath =
  process.argv[3] || join(process.cwd(), '.github', 'badges', 'coverage.json')

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
const linesPct = Number(summary?.total?.lines?.pct)

if (!Number.isFinite(linesPct)) {
  throw new Error(
    `Could not read total.lines.pct from coverage summary: ${summaryPath}`,
  )
}

const rounded = Math.round(linesPct)
const color =
  rounded >= 80
    ? 'brightgreen'
    : rounded >= 70
      ? 'green'
      : rounded >= 50
        ? 'yellow'
        : 'red'

const badge = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${rounded}%`,
  color,
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(badge, null, 2)}\n`)
console.log(`Wrote ${outPath} (${badge.message}, ${badge.color})`)
