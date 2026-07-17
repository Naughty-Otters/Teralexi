import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const MAIN_DIR = join(process.cwd(), 'dist', 'electron', 'main')
const BOOTSTRAP_JS = join(MAIN_DIR, 'bootstrap.js')
const MAIN_APP_JS = join(MAIN_DIR, 'main-app.js')

/** Runtime dynamic imports that must stay external in the main bundle. */
const ALLOWED_DYNAMIC_IMPORTS = new Set([
  'node:crypto',
  'node:fs',
  'node:http',
  'node:https',
  'electron',
  'esbuild',
  'playwright-core',
  'cloakbrowser',
  'mmdb-lib',
])

const FORBIDDEN_SUBSTRINGS = [
  'providers/stage-model-registry',
  'dist/electron/providers',
  '@main/agent/providers',
  '@main/agent/run/agent-run',
  '../providers/stage-model-registry',
  '../run/agent-run',
  '../run/resolve-child-agent',
  '../hooks/user-hooks',
  'hooks/user-hooks',
  'agent/hooks/user-hooks',
  '@main/workflows/',
  '@main/services/scheduler-manager',
  '@main/agent/llm/llm-debug-writer',
  'node_modules/grammy/out/',
  'grammy/out/platform.node',
  // Packaged asar regressions: dynamic import left as filesystem path (survives obfuscation).
  '../steps/',
  'foreach-item/strategies/planned-todo-strategy',
]

const SOURCE_SCAN_ROOTS = [
  'src/main',
  'toolSet',
  'config',
  'src/shared',
  'src/logging',
  'src/teralexi-ai',
  'src/ipc',
  'skill-sdk',
]

const SOURCE_SCAN_SKIP = /\.(test|integration\.test|mocked\.test)\.ts$/

const RUNTIME_DYNAMIC_IMPORT_RE =
  /(?:await\s+import|void\s+import)\(\s*['"]([^'"]+)['"]/g

const BOOTSTRAP_ALLOWED_DYNAMIC_IMPORTS = new Set(['./main-app', './main-app.js'])

function isAllowedRuntimeDynamicImport(spec: string): boolean {
  if (ALLOWED_DYNAMIC_IMPORTS.has(spec)) return true
  if (spec.startsWith('node:')) return true
  return false
}

/** Relative app imports must never remain as runtime dynamic imports in asar. */
const ALLOWED_SOURCE_DYNAMIC_IMPORTS = new Set<string>()

export function isForbiddenRuntimeDynamicImport(spec: string): boolean {
  if (isAllowedRuntimeDynamicImport(spec)) return false
  if (ALLOWED_SOURCE_DYNAMIC_IMPORTS.has(spec)) return false
  if (spec.startsWith('.') || spec.startsWith('@')) return true
  return false
}

export function scanSourceTextForForbiddenDynamicImports(
  content: string,
  relPath = 'fixture.ts',
): string[] {
  const violations: string[] = []
  for (const match of content.matchAll(RUNTIME_DYNAMIC_IMPORT_RE)) {
    const spec = match[1]
    if (!spec) continue
    if (
      BOOTSTRAP_ALLOWED_DYNAMIC_IMPORTS.has(spec) &&
      relPath.endsWith('bootstrap.ts')
    ) {
      continue
    }
    if (!isForbiddenRuntimeDynamicImport(spec)) continue
    violations.push(`${relPath}: import('${spec}')`)
  }
  return violations
}

export function findForbiddenSubstringsInMainJs(code: string): string[] {
  return FORBIDDEN_SUBSTRINGS.filter((needle) => code.includes(needle))
}

function isUnbundledAppDynamicImportInMainJs(spec: string): boolean {
  if (isAllowedRuntimeDynamicImport(spec)) return false
  if (spec.startsWith('../')) return true
  if (spec.startsWith('@')) return true
  // Single-segment ./foo and "." are common Rollup/CJS interop in the bundle.
  if (spec.startsWith('./') && spec.includes('/', 2)) return true
  return false
}

export function findUnbundledDynamicImportsInMainJs(code: string): string[] {
  const bad: string[] = []
  for (const match of code.matchAll(/import\(([^)]+)\)/g)) {
    const raw = match[1]?.trim() ?? ''
    const quoted = raw.match(/^['"]([^'"]+)['"]$/)
    if (!quoted) continue
    const spec = quoted[1]
    if (isUnbundledAppDynamicImportInMainJs(spec)) {
      bad.push(spec)
    }
  }
  return bad
}

export function verifyMainBundleContents(code: string): void {
  const forbidden = findForbiddenSubstringsInMainJs(code)
  if (forbidden.length > 0) {
    throw new Error(
      `main-app.js still references forbidden paths: ${forbidden.join(', ')}`,
    )
  }

  const bad = findUnbundledDynamicImportsInMainJs(code)
  if (bad.length > 0) {
    throw new Error(
      `main-app.js has unexpected filesystem dynamic imports: ${bad.join(', ')}`,
    )
  }
}

export function verifyBootstrapBundleContents(code: string): void {
  const forbidden = findForbiddenSubstringsInMainJs(code)
  if (forbidden.length > 0) {
    throw new Error(
      `bootstrap.js still references forbidden paths: ${forbidden.join(', ')}`,
    )
  }

  const bad = findUnbundledDynamicImportsInMainJs(code).filter(
    (spec) => !BOOTSTRAP_ALLOWED_DYNAMIC_IMPORTS.has(spec),
  )
  if (bad.length > 0) {
    throw new Error(
      `bootstrap.js has unexpected filesystem dynamic imports: ${bad.join(', ')}`,
    )
  }
}

function walkSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    const stat = statSync(abs)
    if (stat.isDirectory()) {
      walkSourceFiles(abs, out)
      continue
    }
    if (!abs.endsWith('.ts') && !abs.endsWith('.tsx')) continue
    if (SOURCE_SCAN_SKIP.test(abs)) continue
    out.push(abs)
  }
}

/** Fail CI when main-process sources use dynamic import() for app modules. */
export function scanSourcesForForbiddenDynamicImports(
  cwd = process.cwd(),
): string[] {
  const violations: string[] = []

  for (const root of SOURCE_SCAN_ROOTS) {
    const absRoot = join(cwd, root)
    let stat
    try {
      stat = statSync(absRoot)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue

    const files: string[] = []
    walkSourceFiles(absRoot, files)

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      const rel = relative(cwd, file)
      violations.push(...scanSourceTextForForbiddenDynamicImports(content, rel))
    }
  }

  return violations
}

export function verifyMainBundle(): void {
  const bootstrapCode = readFileSync(BOOTSTRAP_JS, 'utf8')
  verifyBootstrapBundleContents(bootstrapCode)

  const mainAppCode = readFileSync(MAIN_APP_JS, 'utf8')
  verifyMainBundleContents(mainAppCode)

  const sourceViolations = scanSourcesForForbiddenDynamicImports()
  if (sourceViolations.length > 0) {
    throw new Error(
      `Forbidden dynamic imports in main-process sources:\n${sourceViolations.join('\n')}`,
    )
  }
}
