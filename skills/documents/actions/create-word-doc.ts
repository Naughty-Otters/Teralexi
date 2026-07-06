/**
 * create_word_doc — build a formatted .docx Word document using the `docx` library.
 * Writes directly to sandbox output/results/<filename>.docx.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  convertInchesToTwip,
} from 'docx'
import path from 'path'
import fs from 'fs'
import type { SkillTool } from '@teralexi/skill-sdk'
import {
  getOutputResultsRelPrefix,
  requireActiveSandbox,
} from '@teralexi/skill-sdk'

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'document'
}

function parseTableData(raw: unknown): { headers: string[]; rows: string[][] } | null {
  if (typeof raw === 'string') {
    const lines = raw.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return null
    const headers = lines[0].split(',').map((s) => s.trim())
    const rows = lines.slice(1).map((l) => l.split(',').map((s) => s.trim()))
    return { headers, rows }
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    return {
      headers: (obj['headers'] as string[]) ?? [],
      rows: (obj['rows'] as string[][]) ?? [],
    }
  }
  return null
}

function parseSections(raw: unknown): Array<{ heading: string; body: string; level: 1 | 2 }> {
  if (typeof raw === 'string') {
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const colonIdx = line.indexOf(':')
        if (colonIdx < 0) return { heading: line.trim(), body: '', level: 1 as const }
        return {
          heading: line.slice(0, colonIdx).trim(),
          body: line.slice(colonIdx + 1).trim(),
          level: 1 as const,
        }
      })
  }
  if (Array.isArray(raw)) {
    return raw.map((s) => {
      const obj = typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {}
      return {
        heading: String(obj['heading'] ?? ''),
        body: String(obj['body'] ?? ''),
        level: (Number(obj['level'] ?? 1) as 1 | 2),
      }
    })
  }
  return []
}

const HEADER_COLOR = '2E75B6'
const HEADER_TEXT  = 'FFFFFF'
const ALT_ROW_BG   = 'EBF3FB'

// ── tool ─────────────────────────────────────────────────────────────────────

export const createWordDoc: SkillTool = {
  name: 'create_word_doc',
  description:
    'Create a formatted Word document (.docx) from a list of sections (heading + body text). ' +
    'Optionally includes a data table, author, and title page. ' +
    'Writes to sandbox output/results/<filename>.docx.',
  async execute(input) {
    // ── resolve sandbox ──────────────────────────────────────────────────────
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const resultsDir = path.join(sandbox.root, getOutputResultsRelPrefix())
    fs.mkdirSync(resultsDir, { recursive: true })

    // ── parse input ──────────────────────────────────────────────────────────
    const filename   = slugify(String(input['output_filename'] ?? 'document'))
    const docTitle   = String(input['title'] ?? input['output_filename'] ?? 'Document')
    const author     = String(input['author'] ?? '')
    const sections   = parseSections(input['sections'])
    const tableData  = input['table_data'] ? parseTableData(input['table_data']) : null
    const isFormal   = String(input['style'] ?? 'formal') === 'formal'

    if (!sections.length) return { error: 'sections is required' }

    const outputPath = path.join(resultsDir, `${filename}.docx`)

    // ── build children array ─────────────────────────────────────────────────
    const children: (Paragraph | Table)[] = []

    // Title
    children.push(
      new Paragraph({
        children: [new TextRun({ text: docTitle, bold: true, size: 56, color: HEADER_COLOR })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }),
    )

    // Author + date
    if (author) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${author}  ·  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, size: 22, color: '777777' }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
        }),
      )
    }

    // Horizontal rule effect via bottom border
    children.push(
      new Paragraph({
        text: '',
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HEADER_COLOR } },
        spacing: { before: 0, after: 320 },
      }),
    )

    // Sections
    sections.forEach((section) => {
      // Section heading
      children.push(
        new Paragraph({
          text: section.heading,
          heading: section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 120 },
        }),
      )

      // Body paragraphs (split on double-newline)
      const paragraphs = section.body.split(/\n\n+/).filter(Boolean)
      if (paragraphs.length) {
        paragraphs.forEach((para) => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: para.replace(/\n/g, ' '), size: 24 })],
              alignment: isFormal ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
              spacing: { before: 0, after: 160 },
            }),
          )
        })
      } else if (section.body) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.body, size: 24 })],
            alignment: isFormal ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
            spacing: { before: 0, after: 160 },
          }),
        )
      }
    })

    // Optional table
    if (tableData && tableData.headers.length > 0) {
      children.push(
        new Paragraph({
          text: '',
          spacing: { before: 320, after: 160 },
        }),
      )

      const colWidth = Math.floor(9360 / tableData.headers.length)   // twips

      const headerCells = tableData.headers.map((h) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: HEADER_TEXT, size: 22 })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          shading: { type: ShadingType.SOLID, color: HEADER_COLOR },
          width: { size: colWidth, type: WidthType.DXA },
        }),
      )

      const dataRows = tableData.rows.map((row, rowIdx) =>
        new TableRow({
          children: tableData.headers.map((_, colIdx) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: row[colIdx] ?? '', size: 22 })],
                }),
              ],
              shading:
                rowIdx % 2 === 0
                  ? { type: ShadingType.SOLID, color: ALT_ROW_BG }
                  : undefined,
              width: { size: colWidth, type: WidthType.DXA },
            }),
          ),
        }),
      )

      children.push(
        new Table({
          rows: [new TableRow({ children: headerCells }), ...dataRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      )
    }

    // ── assemble and write ───────────────────────────────────────────────────
    const doc = new Document({
      creator: author || 'Teralexi',
      title: docTitle,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1.2),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.2),
              },
            },
          },
          children,
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(outputPath, buffer)

    return {
      success: true,
      file_path: outputPath,
      filename: `${filename}.docx`,
      section_count: sections.length,
      has_table: !!tableData,
      message: `Document created: output/results/${filename}.docx (${sections.length} sections${tableData ? ', with table' : ''})`,
    }
  },
}
