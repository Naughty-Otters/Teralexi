import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RULE_FILE_RE = /\.(?:md|mdc)$/i

/** Fail the build when shipped default project rules are missing. */
export function verifyBundledOpenFdeRules(): void {
  const rulesDir = join(process.cwd(), '.openfde', 'rules')
  if (!existsSync(rulesDir)) {
    throw new Error('missing bundled default rules directory: .openfde/rules')
  }

  let entries: string[]
  try {
    entries = readdirSync(rulesDir)
  } catch (error) {
    throw new Error(`failed to read bundled default rules directory: ${rulesDir}`, {
      cause: error,
    })
  }

  const ruleFiles = entries.filter(
    (entry) => !entry.startsWith('.') && RULE_FILE_RE.test(entry),
  )
  if (ruleFiles.length === 0) {
    throw new Error('bundled default rules directory has no .md or .mdc files')
  }

  console.log(`verify: ${ruleFiles.length} bundled default rule(s) in .openfde/rules`)
}
