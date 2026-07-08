/**
 * validate_website — structural checks on a rendered static site directory.
 */

import fs from 'fs'
import path from 'path'
import type { SkillTool } from '@teralexi/skill-sdk'
import { requireActiveSandbox } from '@teralexi/skill-sdk'

type ValidationIssue = {
  severity: 'error' | 'warning'
  message: string
}

function resolveSiteDir(sandboxRoot: string, siteDir: string): string {
  const trimmed = siteDir.trim()
  if (!trimmed) throw new Error('site_dir is required')
  return path.isAbsolute(trimmed) ? trimmed : path.join(sandboxRoot, trimmed)
}

function collectIssues(siteDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const indexPath = path.join(siteDir, 'index.html')

  if (!fs.existsSync(siteDir)) {
    issues.push({ severity: 'error', message: `site directory not found: ${siteDir}` })
    return issues
  }

  if (!fs.existsSync(indexPath)) {
    issues.push({ severity: 'error', message: 'missing index.html' })
    return issues
  }

  const html = fs.readFileSync(indexPath, 'utf-8')
  if (!/<html[^>]*\blang=/i.test(html)) {
    issues.push({ severity: 'error', message: 'index.html: missing lang on <html>' })
  }
  if (!/<title>[^<]+<\/title>/i.test(html)) {
    issues.push({ severity: 'error', message: 'index.html: missing <title>' })
  }
  if (!/<main[\s>]/i.test(html)) {
    issues.push({ severity: 'warning', message: 'index.html: no <main> landmark' })
  }

  const hrefs = [...html.matchAll(/\bhref="([^"#][^"]*)"/g)].map((m) => m[1])
  for (const href of hrefs) {
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('//')) {
      continue
    }
    const target = path.join(siteDir, href.split('?')[0])
    if (!fs.existsSync(target)) {
      issues.push({ severity: 'error', message: `broken relative link: ${href}` })
    }
  }

  const cssPath = path.join(siteDir, 'styles.css')
  if (html.includes('styles.css') && !fs.existsSync(cssPath)) {
    issues.push({ severity: 'error', message: 'styles.css referenced but missing' })
  }

  return issues
}

export const validateWebsite: SkillTool = {
  name: 'validate_website',
  description:
    'Validate a rendered static site directory: index.html, lang/title, relative links, CSS.',
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const siteDirInput = String(input['site_dir'] ?? '').trim()
    if (!siteDirInput) return { error: 'site_dir is required' }

    let siteDir: string
    try {
      siteDir = resolveSiteDir(sandbox.root, siteDirInput)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }

    const issues = collectIssues(siteDir)
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')

    if (errors.length) {
      return {
        success: false,
        valid: false,
        errors: errors.map((e) => e.message),
        warnings: warnings.map((w) => w.message),
        message: `Validation failed: ${errors.map((e) => e.message).join('; ')}`,
      }
    }

    return {
      success: true,
      valid: true,
      warnings: warnings.map((w) => w.message),
      message:
        warnings.length > 0
          ? `Site passed with warnings: ${warnings.map((w) => w.message).join('; ')}`
          : 'Site validation passed',
    }
  },
}
