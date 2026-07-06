/**
 * create_presentation — build a .pptx presentation using pptxgenjs.
 * Writes directly to sandbox output/results/<filename>.pptx.
 */

import pptxgen from 'pptxgenjs'
import path from 'path'
import fs from 'fs'
import type { SkillTool } from '@teralexi/skill-sdk'
import {
  getOutputResultsRelPrefix,
  requireActiveSandbox,
} from '@teralexi/skill-sdk'
import { resolvePptTheme, type PptThemeEntry } from './template-core/load-themes'

function resolveThemeFromInput(input: Record<string, unknown>): {
  themeKey: string
  theme: PptThemeEntry
} {
  const themeKey = String(input['theme'] ?? 'navy')
  const fromInput = input['ppt_theme'] as PptThemeEntry | undefined
  const theme = fromInput ?? resolvePptTheme(themeKey)
  const customColor = input['theme_color']
    ? String(input['theme_color']).replace('#', '')
    : undefined
  if (customColor) theme.bg = customColor
  return { themeKey, theme }
}

type Slide = { title: string; bullets?: string[]; notes?: string }

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'presentation'
}

// ── tool ─────────────────────────────────────────────────────────────────────

export const createPresentation: SkillTool = {
  name: 'create_presentation',
  description:
    'Create a PowerPoint presentation (.pptx) from a list of slide definitions. ' +
    'Each slide has a title and optional bullet points. ' +
    'Writes to sandbox output/results/<filename>.pptx.',
  async execute(input) {
    // ── resolve sandbox ──────────────────────────────────────────────────────
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const resultsDir = path.join(sandbox.root, getOutputResultsRelPrefix())
    fs.mkdirSync(resultsDir, { recursive: true })

    // ── parse input ──────────────────────────────────────────────────────────
    const filename    = slugify(String(input['output_filename'] ?? 'presentation'))
    const presTitle   = String(input['presentation_title'] ?? 'Presentation')
    const presenter   = String(input['presenter'] ?? '')
    const { themeKey, theme } = resolveThemeFromInput(input as Record<string, unknown>)
    const titleSlideStyle = theme.titleSlide ?? {}
    const contentSlideStyle = theme.contentSlide ?? {}

    // Parse slides — accept array of objects or raw string outline
    let slides: Slide[] = []
    const rawSlides = input['slides']

    if (Array.isArray(rawSlides)) {
      slides = rawSlides.map((s) => {
        if (typeof s === 'object' && s !== null) {
          const obj = s as Record<string, unknown>
          return {
            title: String(obj['title'] ?? ''),
            bullets: Array.isArray(obj['bullets'])
              ? obj['bullets'].map(String)
              : typeof obj['bullets'] === 'string'
              ? (obj['bullets'] as string).split('|').map((b: string) => b.trim()).filter(Boolean)
              : [],
            notes: obj['notes'] ? String(obj['notes']) : undefined,
          }
        }
        return { title: String(s), bullets: [] }
      })
    } else if (typeof rawSlides === 'string') {
      // Parse outline format: "Title: bullet1 | bullet2\nTitle2: bullet3"
      slides = rawSlides
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const colonIdx = line.indexOf(':')
          if (colonIdx < 0) return { title: line.trim(), bullets: [] }
          const title   = line.slice(0, colonIdx).trim()
          const bullets = line.slice(colonIdx + 1).split('|').map((b) => b.trim()).filter(Boolean)
          return { title, bullets }
        })
    }

    if (!slides.length) return { error: 'slides is required and must contain at least one slide' }

    const outputPath = path.join(resultsDir, `${filename}.pptx`)

    // ── build presentation ───────────────────────────────────────────────────
    const prs = new pptxgen()
    prs.layout = 'LAYOUT_WIDE'   // 13.33" × 7.5" widescreen

    // ── Slide 1: Title slide ─────────────────────────────────────────────────
    const titleSlide = prs.addSlide()
    titleSlide.background = { color: theme.bg }

    // Accent bar at bottom
    const accentBarH = titleSlideStyle.accentBarHeight ?? 0.7
    titleSlide.addShape(prs.ShapeType.rect, {
      x: 0, y: 6.8, w: '100%', h: accentBarH,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    })

    titleSlide.addText(presTitle, {
      x: 0.5, y: 2.2, w: 12.3, h: 1.5,
      fontSize: titleSlideStyle.titleSize ?? 40,
      bold: true,
      color: theme.title,
      align: 'center',
      valign: 'middle',
    })

    if (presenter) {
      titleSlide.addText(presenter, {
        x: 0.5, y: 4.0, w: 12.3, h: 0.6,
        fontSize: titleSlideStyle.subtitleSize ?? 18,
        color: theme.body,
        align: 'center',
      })
    }

    // ── Content slides ───────────────────────────────────────────────────────
    slides.forEach((slide) => {
      const s = prs.addSlide()
      s.background = { color: theme.bg }

      // Left accent stripe
      const stripeW = contentSlideStyle.stripeWidth ?? 0.12
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 0, w: stripeW, h: '100%',
        fill: { color: theme.accent },
        line: { color: theme.accent },
      })

      // Slide title
      s.addText(slide.title, {
        x: 0.3, y: 0.2, w: 12.5, h: 0.9,
        fontSize: contentSlideStyle.titleSize ?? 28,
        bold: true,
        color: theme.title,
        valign: 'middle',
      })

      // Divider line under title
      s.addShape(prs.ShapeType.line, {
        x: 0.3, y: 1.2, w: 12.5, h: 0,
        line: { color: theme.accent, width: 1.5 },
      })

      // Bullet points
      if (slide.bullets && slide.bullets.length > 0) {
        const bulletObjects = slide.bullets.map((b) => ({
          text: b,
          options: { bullet: { type: 'bullet' as const }, paraSpaceAfter: 8 },
        }))

        s.addText(bulletObjects, {
          x: 0.5, y: 1.4, w: 12.0, h: 5.5,
          fontSize: contentSlideStyle.bulletSize ?? 20,
          color: theme.body,
          valign: 'top',
          lineSpacingMultiple: 1.3,
        })
      }

      // Speaker notes
      if (slide.notes) {
        s.addNotes(slide.notes)
      }
    })

    await prs.writeFile({ fileName: outputPath })

    return {
      success: true,
      file_path: outputPath,
      filename: `${filename}.pptx`,
      slide_count: slides.length + 1,   // +1 for title slide
      theme: themeKey,
      message: `Presentation created: output/results/${filename}.pptx (${slides.length + 1} slides)`,
    }
  },
}
