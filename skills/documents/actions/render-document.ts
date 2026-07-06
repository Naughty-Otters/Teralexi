/**
 * render_document — unified template router for documents skill.
 * Reads data.json + manifest template, delegates to format-specific renderers.
 */

import Mustache from 'mustache'
import fs from 'fs'
import path from 'path'
import type { SkillTool } from '@teralexi/skill-sdk'
import {
  exportHtmlFileToPdf,
  getOutputResultsRelPrefix,
  readSkillAttachment,
  requireActiveSandbox,
} from '@teralexi/skill-sdk'
import { createSpreadsheet } from './create-spreadsheet'
import { createPresentation } from './create-presentation'
import { createWordDoc } from './create-word-doc'
import {
  DOCUMENTS_SKILL_ID,
  getTemplateById,
  loadManifest,
  mapToHtmlRenderContext,
  mapToPresentationInput,
  mapToSpreadsheetInput,
  mapToWordDocInput,
  normalizeRawToDocumentData,
  validateDocumentData,
  type DocumentData,
  type TemplateManifestEntry,
} from './template-core'

const DEFAULT_DATA_PATH = 'output/toolLoop/step-2b/results/data.json'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'document'
}

function readDataJson(sandboxRoot: string, dataPath: string): DocumentData {
  const abs = path.isAbsolute(dataPath)
    ? dataPath
    : path.join(sandboxRoot, dataPath)
  if (!fs.existsSync(abs)) {
    throw new Error(`data file not found: ${dataPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf-8'))
  return raw as DocumentData
}

function loadHtmlTemplate(relativePath: string): string {
  const { content } = readSkillAttachment(DOCUMENTS_SKILL_ID, `templates/${relativePath}`)
  return content
}

async function renderHtmlBranch(
  sandboxRoot: string,
  template: TemplateManifestEntry,
  data: DocumentData,
  outputFilename: string,
  outputFormat: 'pdf' | 'html',
): Promise<Record<string, unknown>> {
  const resultsDir = path.join(sandboxRoot, getOutputResultsRelPrefix())
  fs.mkdirSync(resultsDir, { recursive: true })

  const slug = slugify(outputFilename)
  const htmlPath = path.join(resultsDir, `${slug}.html`)
  const templateHtmlPath = template.html ?? ''
  const templateSrc = loadHtmlTemplate(templateHtmlPath)
  const context = mapToHtmlRenderContext(template, data)
  const html = Mustache.render(templateSrc, context)
  fs.writeFileSync(htmlPath, html, 'utf-8')

  if (outputFormat === 'html') {
    return {
      success: true,
      file_path: htmlPath,
      filename: `${slug}.html`,
      format: 'html',
      message: `Report created: output/results/${slug}.html`,
    }
  }

  const pdfPath = path.join(resultsDir, `${slug}.pdf`)
  await exportHtmlFileToPdf(htmlPath, pdfPath)
  return {
    success: true,
    file_path: pdfPath,
    filename: `${slug}.pdf`,
    format: 'pdf',
    html_path: htmlPath,
    message: `Report created: output/results/${slug}.pdf`,
  }
}

export const renderDocument: SkillTool = {
  name: 'render_document',
  description:
    'Render a document from a template manifest entry and normalized data.json. ' +
    'Supports PDF/HTML reports, Excel, PowerPoint, and Word. ' +
    'Preferred step-3 entry point for the documents skill.',
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const templateId = String(input['template_id'] ?? '').trim()
    const outputFilename = String(input['output_filename'] ?? 'document').trim()
    const dataPath = String(input['data_path'] ?? DEFAULT_DATA_PATH).trim()
    const outputFormatRaw = String(input['output_format'] ?? '').trim().toLowerCase()

    if (!templateId) return { error: 'template_id is required' }

    const manifest = loadManifest()
    const template = getTemplateById(manifest, templateId)
    if (!template) {
      return { error: `Unknown template_id: ${templateId}` }
    }

    let data: DocumentData
    try {
      const raw = readDataJson(sandbox.root, dataPath)
      data = normalizeRawToDocumentData(template, raw, outputFilename)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }

    const validationError = validateDocumentData(template, data)
    if (validationError) return { error: validationError }

    const style = (template.style ?? {}) as Record<string, unknown>
    const outputFormat =
      outputFormatRaw === 'html' || outputFormatRaw === 'pdf'
        ? (outputFormatRaw as 'html' | 'pdf')
        : style.output_format === 'html'
          ? 'html'
          : 'pdf'

    switch (template.renderer) {
      case 'html': {
        if (!template.html) return { error: 'Template missing html path' }
        try {
          return await renderHtmlBranch(
            sandbox.root,
            template,
            data,
            outputFilename,
            outputFormat,
          )
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      }
      case 'excel':
        return createSpreadsheet.execute(
          mapToSpreadsheetInput(template, data, outputFilename),
        )
      case 'powerpoint':
        return createPresentation.execute(
          mapToPresentationInput(template, data, outputFilename),
        )
      case 'word':
        return createWordDoc.execute(
          mapToWordDocInput(template, data, outputFilename),
        )
      default:
        return { error: `Unsupported renderer: ${template.renderer}` }
    }
  },
}
