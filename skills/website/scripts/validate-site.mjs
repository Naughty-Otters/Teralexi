#!/usr/bin/env node
/**
 * Optional deeper validation — checks index.html and link targets under a site dir.
 * Usage: node validate-site.mjs <site-dir-relative-to-cwd>
 */
import fs from 'node:fs'
import path from 'node:path'

const siteDir = process.argv[2]
if (!siteDir) {
  console.error('usage: node validate-site.mjs <site-dir>')
  process.exit(1)
}

const abs = path.resolve(siteDir)
const indexPath = path.join(abs, 'index.html')
const errors = []

if (!fs.existsSync(indexPath)) {
  errors.push('missing index.html')
} else {
  const html = fs.readFileSync(indexPath, 'utf-8')
  if (!/<html[^>]*lang=/i.test(html)) errors.push('index.html: missing lang on <html>')
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push('index.html: missing <title>')
  const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1])
  for (const href of hrefs) {
    if (href.startsWith('http') || href.startsWith('mailto:')) continue
    const target = path.join(abs, href.split('?')[0])
    if (!fs.existsSync(target)) errors.push(`broken link: ${href}`)
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log('OK')
