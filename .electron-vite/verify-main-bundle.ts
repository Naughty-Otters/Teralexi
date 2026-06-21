import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MAIN_JS = join(process.cwd(), 'dist', 'electron', 'main', 'main.js')

/** Runtime dynamic imports that must stay external in the main bundle. */
const ALLOWED_DYNAMIC_IMPORTS = new Set([
  'node:crypto',
  'node:fs',
  'node:http',
  'node:https',
  'electron',
  'playwright-core',
  'mmdb-lib',
])

const FORBIDDEN_SUBSTRINGS = [
  'providers/stage-model-registry',
  'dist/electron/providers',
  '@main/agent/providers',
  '@main/agent/run/agent-run',
  '../providers/stage-model-registry',
  '../run/agent-run',
]

export function verifyMainBundle(): void {
  const code = readFileSync(MAIN_JS, 'utf8')

  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (code.includes(needle)) {
      throw new Error(
        `main.js still references "${needle}" — dynamic import was not bundled. Rebuild or fix rollup output.`,
      )
    }
  }

  const imports = [...code.matchAll(/import\(([^)]+)\)/g)]
  const bad: string[] = []

  for (const match of imports) {
    const raw = match[1]?.trim() ?? ''
    const quoted = raw.match(/^['"]([^'"]+)['"]$/)
    if (!quoted) continue
    const spec = quoted[1]
    if (ALLOWED_DYNAMIC_IMPORTS.has(spec)) continue
    if (spec.startsWith('node:')) continue
    if (spec.includes('/') || spec.startsWith('.') || spec.startsWith('@')) {
      bad.push(spec)
    }
  }

  if (bad.length > 0) {
    throw new Error(
      `main.js has unexpected filesystem dynamic imports: ${bad.join(', ')}`,
    )
  }
}
