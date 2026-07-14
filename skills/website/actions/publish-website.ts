/**
 * publish_website — zip a static site directory and upload to Teralexi hosting.
 */

import fs from 'fs'
import path from 'path'
import type { SkillTool } from '@teralexi/skill-sdk'
import {
  getWorkspacePathFromEnv,
  publishStaticSiteDirectory,
  requireActiveSandbox,
  resolvePathAllowingOutside,
} from '@teralexi/skill-sdk'

function resolveSiteDirectory(sitePath: string):
  | { ok: true; abs: string }
  | { ok: false; error: string } {
  const trimmed = sitePath.trim()
  if (!trimmed) {
    return {
      ok: false,
      error:
        'path is required. Pass the site directory containing root index.html (sandbox output/results/<slug> or a workspace folder).',
    }
  }

  const sandbox = requireActiveSandbox()
  const workspacePath = getWorkspacePathFromEnv()

  try {
    if (path.isAbsolute(trimmed)) {
      if (!fs.existsSync(trimmed) || !fs.statSync(trimmed).isDirectory()) {
        return { ok: false, error: `Site directory not found: ${trimmed}` }
      }
      return { ok: true, abs: trimmed }
    }

    if (sandbox.ok) {
      const fromSandbox = resolvePathAllowingOutside(
        sandbox.root,
        trimmed,
        workspacePath,
      )
      if (fs.existsSync(fromSandbox) && fs.statSync(fromSandbox).isDirectory()) {
        return { ok: true, abs: fromSandbox }
      }
    }

    if (workspacePath?.trim()) {
      const fromWs = path.join(workspacePath.trim(), trimmed)
      if (fs.existsSync(fromWs) && fs.statSync(fromWs).isDirectory()) {
        return { ok: true, abs: fromWs }
      }
    }

    return {
      ok: false,
      error: `Site directory not found: ${trimmed}`,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export const publishWebsite: SkillTool = {
  name: 'publish_website',
  description:
    'Publish a finished static site directory to Teralexi hosting. ' +
    'Zips the directory (index.html must be at the directory root), uploads via ' +
    'POST /api/v1/app/web/upload, and returns the public absolute URL. ' +
    'Requires signed-in Teralexi account with app.web.publish entitlement.',
  async execute(input) {
    const sitePath = String(
      (input as { path?: unknown; site_dir?: unknown }).path ??
        (input as { site_dir?: unknown }).site_dir ??
        '',
    ).trim()
    const verify = Boolean((input as { verify?: unknown }).verify)

    const resolved = resolveSiteDirectory(sitePath)
    if (!resolved.ok) return { error: resolved.error }

    const result = await publishStaticSiteDirectory({
      siteDir: resolved.abs,
      verify,
    })

    if (!result.ok) {
      return {
        success: false,
        error: result.error,
        code: result.code,
        status: result.status,
      }
    }

    return {
      success: true,
      ok: true,
      absoluteUrl: result.absoluteUrl,
      url: result.url,
      user_id: result.userId,
      file_count: result.fileCount,
      bytes: result.bytes,
      zip_file_count: result.zipFileCount,
      ...(result.verifyStatus !== undefined
        ? { verify_status: result.verifyStatus }
        : {}),
      message: `Published. Public URL: ${result.absoluteUrl}`,
    }
  },
}
