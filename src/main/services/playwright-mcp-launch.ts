import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Resolve the bundled `@playwright/mcp` CLI (`cli.js`) from node_modules.
 * Main-process only — must not be imported by the renderer.
 */
export function resolvePlaywrightMcpCliPath(
  appPath?: string | null,
): string | null {
  const roots = [
    appPath?.trim() || '',
    process.cwd(),
  ].filter(Boolean)

  for (const root of roots) {
    const direct = join(root, 'node_modules', '@playwright', 'mcp', 'cli.js')
    if (existsSync(direct)) return direct

    try {
      const require = createRequire(join(root, 'package.json'))
      const pkgJson = require.resolve('@playwright/mcp/package.json')
      const cliPath = join(dirname(pkgJson), 'cli.js')
      if (existsSync(cliPath)) return cliPath
    } catch {
      // try next root
    }
  }

  return null
}
