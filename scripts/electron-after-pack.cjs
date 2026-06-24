const { existsSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

/** Entire packages that are not needed in the packaged runtime app. */
const RUNTIME_PACKAGE_REMOVALS = new Set([
  'monaco-editor',
  'mermaid',
  'shiki',
  'reka-ui',
  'vue',
  'vue-router',
  'pinia',
  'tailwindcss',
  'sass',
  'fontless',
  'lightningcss',
  '@nuxt/ui',
  'eslint',
  'prettier',
  'vite',
  'vitest',
  'javascript-obfuscator',
  'electron',
  'electron-builder',
  'electron-devtools-vendor',
  'app-builder-bin',
  'electron-winstaller',
  '7zip-bin',
  'cfonts',
  'figlet',
  'workflow',
  'jspdf',
  'g',
  'date-fns',
])

/** Remove whole scoped trees when the scope is renderer/build-only. */
const RUNTIME_SCOPE_PREFIX_REMOVALS = [
  '@mermaid-js/',
  '@shikijs/',
  '@nuxt/',
  '@vitejs/',
  '@vitest/',
  '@tailwindcss/',
  '@vue/',
  '@eslint/',
  '@workflow/',
]

const JUNK_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
  'docs',
  'example',
  'examples',
  'coverage',
  'benchmark',
  'benchmarks',
])

const JUNK_FILE_RE = /\.(?:map|md|markdown|ts|mts|cts|flow|yml|yaml)$/i
const KEEP_FILE_RE = /^(?:license|readme|changelog)(?:\..*)?$/i

/** Test and dev-only sources that must not ship in the packaged app. */
const SHIPPED_SOURCE_TEST_FILE_RE =
  /\.(?:test|integration\.test|mocked\.test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i
const SHIPPED_SOURCE_TEST_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
])
const SHIPPED_SOURCE_PRUNE_ROOTS = [
  'config',
  'dist/electron',
]

/** Legacy shipped trees that must never appear in the packaged app. */
const SHIPPED_SOURCE_TREE_REMOVALS = ['src']

function shouldRemovePackage(name) {
  if (RUNTIME_PACKAGE_REMOVALS.has(name)) return true
  return RUNTIME_SCOPE_PREFIX_REMOVALS.some((prefix) => name.startsWith(prefix))
}

function removePackageDir(nodeModulesDir, name) {
  const target = join(nodeModulesDir, name)
  if (!existsSync(target)) return false
  rmSync(target, { recursive: true, force: true })
  return true
}

function shouldRemoveShippedSourceTestFile(fileName) {
  if (fileName === 'vitest.setup.ts' || fileName === 'vitest.setup.js') {
    return true
  }
  if (fileName === 'migration-test-db.test.ts') return true
  return SHIPPED_SOURCE_TEST_FILE_RE.test(fileName)
}

function pruneShippedSourceTestsInDir(dir, stats) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SHIPPED_SOURCE_TEST_DIR_NAMES.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true })
        stats.sourceTestDirs += 1
        continue
      }
      pruneShippedSourceTestsInDir(fullPath, stats)
      continue
    }

    if (!entry.isFile()) continue
    if (!shouldRemoveShippedSourceTestFile(entry.name)) continue
    rmSync(fullPath, { force: true })
    stats.sourceTestFiles += 1
  }
}

function pruneShippedSourceTests(appDir) {
  const stats = { sourceTestDirs: 0, sourceTestFiles: 0 }
  for (const relRoot of SHIPPED_SOURCE_PRUNE_ROOTS) {
    const root = join(appDir, relRoot)
    if (!existsSync(root)) continue
    pruneShippedSourceTestsInDir(root, stats)
  }
  return stats
}

function pruneJunkInDir(dir, stats) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (JUNK_DIR_NAMES.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true })
        stats.junkDirs += 1
        continue
      }
      pruneJunkInDir(fullPath, stats)
      continue
    }

    if (!entry.isFile()) continue
    const fileName = entry.name
    if (KEEP_FILE_RE.test(fileName)) continue
    if (JUNK_FILE_RE.test(fileName)) {
      rmSync(fullPath, { force: true })
      stats.junkFiles += 1
    }
  }
}

function pruneRuntimeExcludedPackages(appDir) {
  const nodeModulesDir = join(appDir, 'node_modules')
  if (!existsSync(nodeModulesDir)) return 0

  let removedPackages = 0
  const scoped = new Map()

  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('@')) {
      const scopeDir = join(nodeModulesDir, name)
      for (const child of readdirSync(scopeDir, { withFileTypes: true })) {
        if (!child.isDirectory()) continue
        scoped.set(`${name}/${child.name}`, join(scopeDir, child.name))
      }
      continue
    }
    if (shouldRemovePackage(name) && removePackageDir(nodeModulesDir, name)) {
      removedPackages += 1
    }
  }

  for (const [pkgName, pkgPath] of scoped) {
    if (!shouldRemovePackage(pkgName)) continue
    if (existsSync(pkgPath)) {
      rmSync(pkgPath, { recursive: true, force: true })
      removedPackages += 1
    }
  }

  return removedPackages
}

function pruneJunkInNodeModules(appDir) {
  const nodeModulesDir = join(appDir, 'node_modules')
  const stats = { junkDirs: 0, junkFiles: 0 }
  if (!existsSync(nodeModulesDir)) return stats

  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const top = join(nodeModulesDir, entry.name)
    if (entry.name.startsWith('@')) {
      for (const child of readdirSync(top, { withFileTypes: true })) {
        if (child.isDirectory()) {
          pruneJunkInDir(join(top, child.name), stats)
        }
      }
      continue
    }
    pruneJunkInDir(top, stats)
  }

  return stats
}

function removeShippedSourceTrees(appDir) {
  let removedTrees = 0
  for (const relRoot of SHIPPED_SOURCE_TREE_REMOVALS) {
    const root = join(appDir, relRoot)
    if (!existsSync(root)) continue
    rmSync(root, { recursive: true, force: true })
    removedTrees += 1
  }
  return removedTrees
}

function pruneDirectory(dir) {
  const stats = {
    removedPackages: pruneRuntimeExcludedPackages(dir),
    removedSourceTrees: removeShippedSourceTrees(dir),
    junkDirs: 0,
    junkFiles: 0,
    sourceTestDirs: 0,
    sourceTestFiles: 0,
  }
  const junk = pruneJunkInNodeModules(dir)
  stats.junkDirs = junk.junkDirs
  stats.junkFiles = junk.junkFiles
  const sourceTests = pruneShippedSourceTests(dir)
  stats.sourceTestDirs = sourceTests.sourceTestDirs
  stats.sourceTestFiles = sourceTests.sourceTestFiles
  return stats
}

function formatPruneStats(stats) {
  return [
    `removed ${stats.removedPackages} packages`,
    `removed ${stats.removedSourceTrees} source trees`,
    `deleted ${stats.junkDirs} junk dirs and ${stats.junkFiles} junk files`,
    `deleted ${stats.sourceTestDirs} test dirs and ${stats.sourceTestFiles} test files from shipped sources`,
  ].join('; ')
}

function resourcesDir(context) {
  const { appOutDir, packager, electronPlatformName } = context
  const appName = packager.appInfo.productFilename
  if (electronPlatformName === 'darwin') {
    return join(appOutDir, `${appName}.app`, 'Contents', 'Resources')
  }
  return join(appOutDir, 'resources')
}

/** electron-builder afterPack hook (CommonJS for macOS + Windows CI). */
async function afterPack(context) {
  const unpackedDir = join(resourcesDir(context), 'app.asar.unpacked')
  if (!existsSync(unpackedDir)) {
    return
  }

  const stats = pruneDirectory(unpackedDir)
  console.log(`[afterPack] ${formatPruneStats(stats)} in ${unpackedDir}`)
}

module.exports = afterPack
module.exports.RUNTIME_PACKAGE_REMOVALS = RUNTIME_PACKAGE_REMOVALS
module.exports.RUNTIME_SCOPE_PREFIX_REMOVALS = RUNTIME_SCOPE_PREFIX_REMOVALS
module.exports.shouldRemovePackage = shouldRemovePackage
module.exports.shouldRemoveShippedSourceTestFile = shouldRemoveShippedSourceTestFile
module.exports.pruneShippedSourceTests = pruneShippedSourceTests
module.exports.pruneShippedSourceTrees = removeShippedSourceTrees
