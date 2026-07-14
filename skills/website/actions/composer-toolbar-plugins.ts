/**
 * Website skill — composer toolbar plugins (input-box buttons).
 *
 * Publish is enabled when the conversation has a workspace folder with a
 * finished site (`index.html` at the workspace root or an immediate child
 * directory) — not when a sandbox `output/results/` preview exists alone.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  SkillComposerToolbarPlugin,
  SkillComposerToolbarPluginContext,
} from '@main/skills/composer-toolbar-plugin'
import { publishStaticSiteDirectory } from '@main/services/app-web-publish-client'
import { getTeralexiServerAccessToken } from '@main/services/teralexi-server-auth'
import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import { getEntitlementCache } from '@main/services/entitlement-store'
import { hasCachedEntitlementFeature } from '@shared/subscription/entitlement-features'
import { ENTITLEMENT_FEATURES } from '@shared/subscription/entitlement-types'

function hasIndexAt(dir: string): boolean {
  return (
    existsSync(join(dir, 'index.html')) || existsSync(join(dir, 'index.htm'))
  )
}

/**
 * Prefer workspace root when it has index.html; otherwise the newest immediate
 * child directory that contains an index (e.g. public/, docs/, promoted slug/).
 */
function findPublishableSiteDirs(workspacePath: string): string[] {
  const root = workspacePath.trim()
  if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
    return []
  }

  const dirs: Array<{ path: string; mtime: number }> = []

  if (hasIndexAt(root)) {
    dirs.push({ path: root, mtime: statSync(root).mtimeMs })
  }

  try {
    for (const name of readdirSync(root)) {
      if (name.startsWith('.')) continue
      const siteDir = join(root, name)
      try {
        if (!statSync(siteDir).isDirectory()) continue
        if (!hasIndexAt(siteDir)) continue
        dirs.push({ path: siteDir, mtime: statSync(siteDir).mtimeMs })
      } catch {
        /* skip */
      }
    }
  } catch {
    /* unreadable workspace */
  }

  // Prefer nested site dirs over the workspace root when both exist (promotion
  // into public/docs is common); among peers, newest mtime wins.
  dirs.sort((a, b) => {
    const aIsRoot = a.path === root
    const bIsRoot = b.path === root
    if (aIsRoot !== bIsRoot) return aIsRoot ? 1 : -1
    return b.mtime - a.mtime
  })
  return dirs.map((d) => d.path)
}

function latestSiteDir(
  ctx: SkillComposerToolbarPluginContext,
): string | null {
  const workspace = ctx.workspacePath?.trim()
  if (!workspace) return null
  return findPublishableSiteDirs(workspace)[0] ?? null
}

async function isSignedInForPublish(): Promise<boolean> {
  const token = await getTeralexiServerAccessToken(getTeralexiBaseApiUrl())
  return Boolean(token?.trim())
}

export const publishWebsiteComposerPlugin: SkillComposerToolbarPlugin = {
  id: 'publish-website',
  label: 'Publish website',
  icon: 'globe',
  async isEnabled(ctx) {
    if (!latestSiteDir(ctx)) return false
    if (!(await isSignedInForPublish())) return false
    return hasCachedEntitlementFeature(
      getEntitlementCache(),
      ENTITLEMENT_FEATURES.APP_WEB_PUBLISH,
    )
  },
  async getDisabledReason(ctx) {
    if (!ctx.workspacePath?.trim()) {
      return 'Select a project folder in the toolbar, then promote the site into it'
    }
    if (!latestSiteDir(ctx)) {
      return 'No index.html in the workspace yet (promote the finished site first)'
    }
    if (!(await isSignedInForPublish())) {
      return 'Sign in to Teralexi to publish'
    }
    if (
      !hasCachedEntitlementFeature(
        getEntitlementCache(),
        ENTITLEMENT_FEATURES.APP_WEB_PUBLISH,
      )
    ) {
      return 'Publishing is not included in your plan'
    }
    return undefined
  },
  async execute(ctx) {
    const siteDir = latestSiteDir(ctx)
    if (!siteDir) {
      return {
        ok: false,
        error:
          'No publishable site in the workspace. Promote a site with index.html first.',
      }
    }
    const result = await publishStaticSiteDirectory({ siteDir })
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    return {
      ok: true,
      message: `Published. Public URL: ${result.absoluteUrl}`,
    }
  },
}

export const composerToolbarPlugins: SkillComposerToolbarPlugin[] = [
  publishWebsiteComposerPlugin,
]
