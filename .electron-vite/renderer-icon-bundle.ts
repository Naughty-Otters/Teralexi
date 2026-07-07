import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { getIcons } from '@iconify/utils'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)

const VIRTUAL_ID = 'virtual:renderer-lucide-icons'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const LUCIDE_ICON_RE = /i-lucide-([a-z0-9-]+)/g
const SCAN_EXTENSIONS = /\.(vue|ts|tsx|js|jsx|css|md)$/

function walkScanDir(dir: string, icons: Set<string>) {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      walkScanDir(fullPath, icons)
      continue
    }

    if (!SCAN_EXTENSIONS.test(entry)) continue

    let content: string
    try {
      content = readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }

    for (const match of content.matchAll(LUCIDE_ICON_RE)) {
      icons.add(match[1]!)
    }
  }
}

function collectLucideIconNames(rendererRoot: string, repoRoot: string): string[] {
  const icons = new Set<string>()
  walkScanDir(rendererRoot, icons)
  walkScanDir(
    join(repoRoot, 'node_modules/@nuxt/ui/dist'),
    icons,
  )
  return [...icons].sort()
}

function buildIconBundleModule(iconNames: string[]): string {
  if (iconNames.length === 0) {
    return 'export {}'
  }

  // Loaded at build time only; icon SVG data is inlined into the client bundle.
  const lucideData = require('@iconify-json/lucide/icons.json') as Parameters<
    typeof getIcons
  >[0]
  const subset = getIcons(lucideData, iconNames, true)
  if (!subset) {
    throw new Error(
      `[renderer-icon-bundle] Failed to resolve lucide icons: ${iconNames.join(', ')}`,
    )
  }

  const missing = subset.not_found ?? []
  if (missing.length > 0) {
    console.warn(
      `[renderer-icon-bundle] Missing lucide icons (skipped): ${missing.join(', ')}`,
    )
  }

  return `import { addCollection } from '@iconify/vue'

addCollection(${JSON.stringify(subset)})
`
}

export function rendererIconBundlePlugin(
  rendererRoot: string,
  repoRoot: string,
): Plugin {
  let iconNames = collectLucideIconNames(rendererRoot, repoRoot)

  return {
    name: 'renderer-icon-bundle',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      return buildIconBundleModule(iconNames)
    },
    handleHotUpdate({ file, server }) {
      if (!SCAN_EXTENSIONS.test(file)) return
      const nextNames = collectLucideIconNames(rendererRoot, repoRoot)
      if (nextNames.join('\0') === iconNames.join('\0')) return
      iconNames = nextNames
      const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
      if (!mod) return
      server.moduleGraph.invalidateModule(mod)
      return [mod]
    },
  }
}
