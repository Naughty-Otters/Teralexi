/**
 * Website skill — composer toolbar plugins (input-box buttons).
 *
 * Publish packs the latest finished site (workspace first, else sandbox
 * `output/results/<slug>`), uploads to Teralexi hosting, and returns the public URL.
 */

import type {
  SkillComposerToolbarPlugin,
  SkillComposerToolbarPluginContext,
} from '@main/skills/composer-toolbar-plugin'
import { resolveSandboxRootForConversation } from '@main/agent/sandbox/registry'
import { publishStaticSiteDirectory } from '@main/services/app-web-publish-client'
import { listStaticSiteFiles } from '@main/services/app-web-site-zip'
import { getTeralexiServerAccessToken } from '@main/services/teralexi-server-auth'
import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import { getEntitlementCache } from '@main/services/entitlement-store'
import { hasCachedEntitlementFeature } from '@shared/subscription/entitlement-features'
import { ENTITLEMENT_FEATURES } from '@shared/subscription/entitlement-types'
import { TERALEXI_PLATFORM_PATHS } from '@shared/teralexi-platform-api'
import { latestPublishableSiteDir } from './publish-site-resolve'

const PREVIEW_SAMPLE_LIMIT = 20

function searchRoots(ctx: SkillComposerToolbarPluginContext) {
  const conversationId = ctx.conversationId?.trim()
  return {
    workspacePath: ctx.workspacePath,
    sandboxRoot: conversationId
      ? resolveSandboxRootForConversation(conversationId)
      : null,
  }
}

function latestSiteDir(ctx: SkillComposerToolbarPluginContext): string | null {
  return latestPublishableSiteDir(searchRoots(ctx))
}

async function isSignedInForPublish(): Promise<boolean> {
  const token = await getTeralexiServerAccessToken(getTeralexiBaseApiUrl())
  return Boolean(token?.trim())
}

function targetHostFromOrigin(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin.replace(/^https?:\/\//, '').replace(/\/+$/, '') || origin
  }
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
    if (!latestSiteDir(ctx)) {
      return 'No finished site yet (need index.html in the workspace or sandbox output/results)'
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
  async preview(ctx) {
    const siteDir = latestSiteDir(ctx)
    if (!siteDir) {
      return {
        ok: false,
        title: 'Publish website',
        error:
          'No publishable site found. Finish rendering (sandbox output/results) or promote the site into the workspace first.',
      }
    }

    const listed = listStaticSiteFiles(siteDir)
    if (!listed.ok) {
      return {
        ok: false,
        title: 'Publish website',
        error: listed.error,
        siteDir,
      }
    }

    const origin = getTeralexiBaseApiUrl().trim()
    const sampleFiles = listed.files.slice(0, PREVIEW_SAMPLE_LIMIT)
    const truncatedRemaining = Math.max(0, listed.fileCount - sampleFiles.length)

    return {
      ok: true,
      title: 'Publish website',
      siteDir,
      fileCount: listed.fileCount,
      estimatedBytes: listed.estimatedBytes,
      sampleFiles,
      truncatedRemaining,
      targetHost: targetHostFromOrigin(origin),
      uploadPath: TERALEXI_PLATFORM_PATHS.appWebUpload,
    }
  },
  async execute(ctx) {
    const siteDir = latestSiteDir(ctx)
    if (!siteDir) {
      return {
        ok: false,
        error:
          'No publishable site found. Finish rendering (sandbox output/results) or promote the site into the workspace first.',
      }
    }
    const result = await publishStaticSiteDirectory({ siteDir, verify: true })
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        siteDir,
        uploadStatus: result.status,
      }
    }
    return {
      ok: true,
      absoluteUrl: result.absoluteUrl,
      relativeUrl: result.url,
      siteDir,
      fileCount: result.fileCount,
      bytes: result.bytes,
      uploadStatus: result.uploadStatus,
      verifyStatus: result.verifyStatus,
      message: `Published. Public URL: ${result.absoluteUrl}`,
    }
  },
}

export const composerToolbarPlugins: SkillComposerToolbarPlugin[] = [
  publishWebsiteComposerPlugin,
]
