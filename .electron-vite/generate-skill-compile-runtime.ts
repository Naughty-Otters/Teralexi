import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import esbuild from 'esbuild'

const OUT_DIR = join(process.cwd(), 'dist/electron/skill-compile-runtime')

const SOURCE_ROOTS = [
  'src/main',
  'src/shared',
  'src/logging',
  'src/openfde-ai',
  'config',
  'toolSet',
] as const

const SKIP_FILE_RE =
  /\.(?:test|integration\.test|mocked\.test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i

function isHiddenOrIgnored(name: string): boolean {
  return name.startsWith('.') || name === '__pycache__' || name === 'node_modules'
}

function collectTypeScriptEntries(rootDir: string, relRoot: string, out: string[]): void {
  for (const entry of readdirSync(rootDir)) {
    if (isHiddenOrIgnored(entry)) continue
    const full = join(rootDir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      collectTypeScriptEntries(full, relRoot, out)
      continue
    }
    if (!st.isFile()) continue
    if (SKIP_FILE_RE.test(entry)) continue
    if (!/\.(?:tsx?|mts|cts)$/.test(entry)) continue
    out.push(relative(process.cwd(), full).split('\\').join('/'))
  }
}

/** Transpile skill-compile dependencies to JS for packaged user-skill esbuild. */
export function generateSkillCompileRuntime(): number {
  const entryPoints: string[] = []
  for (const relRoot of SOURCE_ROOTS) {
    const absRoot = join(process.cwd(), relRoot)
    if (!existsSync(absRoot)) {
      throw new Error(`skill-compile-runtime source missing: ${relRoot}`)
    }
    collectTypeScriptEntries(absRoot, relRoot, entryPoints)
  }

  if (entryPoints.length === 0) {
    throw new Error('skill-compile-runtime has no entry points')
  }

  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true })
  }
  mkdirSync(OUT_DIR, { recursive: true })

  esbuild.buildSync({
    entryPoints,
    outdir: OUT_DIR,
    outbase: process.cwd(),
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    logLevel: 'silent',
    tsconfig: join(process.cwd(), 'tsconfig.json'),
  })

  return entryPoints.length
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = generateSkillCompileRuntime()
  console.log(`generated skill-compile-runtime (${count} modules)`)
}
