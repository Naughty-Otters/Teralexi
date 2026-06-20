import MarkdownIt from 'markdown-it'

import {
  pdfDocumentFontFaceCss,
  PDF_MONO_FONT_STACK,
  PDF_SERIF_FONT_STACK,
} from './pdf-print-styles'

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

/** Print-oriented HTML for research report PDF export. */
export function renderResearchReportHtmlDocument(markdownBody: string): string {
  const bodyHtml = markdown.render(markdownBody)
  return buildResearchReportHtmlDocument(enhanceReportHtml(bodyHtml))
}

/**
 * Post-process rendered HTML to add semantic wrappers and data-table classes.
 *
 * - Wraps the Abstract blockquote in an `.abstract-callout` div for distinct styling.
 * - Marks tables that immediately follow a Key Findings h2 with `.key-findings-table`.
 */
function enhanceReportHtml(html: string): string {
  // Wrap <blockquote> that directly follows the Abstract h2 as a callout.
  let result = html.replace(
    /(<h2[^>]*>\s*Abstract\s*<\/h2>\s*)(<blockquote[\s\S]*?<\/blockquote>)/i,
    '$1<div class="abstract-callout">$2</div>',
  )

  // Mark the first table inside a Key Findings section.
  result = result.replace(
    /(<h2[^>]*>\s*Key Findings\s*<\/h2>[\s\S]*?)(<table)/i,
    (match, before, tableTag) => `${before}<table class="key-findings-table"`,
  )

  return result
}

function buildResearchReportHtmlDocument(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Report</title>
    <style>
      ${pdfDocumentFontFaceCss()}
      /* ── Page layout ─────────────────────────────────────────────────────── */
      @page {
        size: A4;
        margin: 22mm 18mm 26mm;
      }
      @page :first {
        margin-top: 28mm;
      }

      /* ── Base ────────────────────────────────────────────────────────────── */
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        font: 11pt/1.6 ${PDF_SERIF_FONT_STACK};
        color: #111827;
        background: #ffffff;
      }
      main {
        max-width: 660px;
        margin: 0 auto;
      }

      /* ── Headings ─────────────────────────────────────────────────────────── */
      h1 {
        font-size: 21pt;
        font-weight: 700;
        line-height: 1.2;
        margin: 0 0 0.6em;
        padding-bottom: 0.4em;
        border-bottom: 2px solid #1e3a5f;
        color: #1e3a5f;
        break-after: avoid;
      }
      h2 {
        font-size: 13.5pt;
        font-weight: 700;
        margin: 1.8em 0 0.5em;
        padding-bottom: 0.2em;
        border-bottom: 1px solid #e5e7eb;
        color: #1e3a5f;
        break-after: avoid;
        break-before: auto;
      }
      h3 {
        font-size: 11.5pt;
        font-weight: 700;
        margin: 1.2em 0 0.35em;
        color: #374151;
        break-after: avoid;
      }
      h4 {
        font-size: 11pt;
        font-weight: 700;
        margin: 1em 0 0.3em;
        color: #4b5563;
        break-after: avoid;
      }

      /* ── Body text ───────────────────────────────────────────────────────── */
      p { margin: 0.5em 0; }
      ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
      li { margin: 0.3em 0; }
      strong { color: #111827; }

      /* ── Abstract callout ────────────────────────────────────────────────── */
      .abstract-callout {
        margin: 0.75em 0 1.5em;
      }
      .abstract-callout blockquote,
      blockquote {
        margin: 0.6em 0;
        padding: 0.9em 1.1em;
        background: #f0f4f8;
        border-left: 4px solid #1e3a5f;
        border-radius: 0 4px 4px 0;
        color: #1f2937;
        font-style: normal;
        font-size: 10.5pt;
        line-height: 1.65;
      }
      blockquote p { margin: 0.3em 0; }

      /* ── Tables ──────────────────────────────────────────────────────────── */
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.9em 0 1.1em;
        font-size: 9.5pt;
        break-inside: avoid;
      }
      th {
        background: #1e3a5f;
        color: #ffffff;
        font-weight: 700;
        padding: 7px 9px;
        text-align: left;
        border: 1px solid #1e3a5f;
      }
      td {
        padding: 6px 9px;
        border: 1px solid #d1d5db;
        vertical-align: top;
      }
      /* Zebra stripes */
      tbody tr:nth-child(even) td { background: #f8fafc; }
      tbody tr:nth-child(odd)  td { background: #ffffff; }

      /* Key Findings table — extra emphasis */
      table.key-findings-table {
        margin-top: 1em;
        box-shadow: 0 1px 4px rgba(30,58,95,0.10);
      }
      table.key-findings-table th {
        background: #1e3a5f;
        font-size: 10pt;
      }
      table.key-findings-table td:nth-child(1) {
        font-weight: 700;
        color: #1e3a5f;
        width: 3%;
        white-space: nowrap;
      }

      /* ── Links & citations ───────────────────────────────────────────────── */
      a { color: #1d4ed8; text-decoration: none; }
      a:hover { text-decoration: underline; }
      /* Inline citation markers like [1], [2] */
      a[href^="#ref"],
      a[href^="["] {
        vertical-align: super;
        font-size: 8pt;
        line-height: 0;
        color: #1d4ed8;
      }

      /* ── Code ────────────────────────────────────────────────────────────── */
      code, pre {
        font-family: ${PDF_MONO_FONT_STACK};
        font-size: 9pt;
      }
      code {
        padding: 0.1em 0.3em;
        background: #f3f4f6;
        border-radius: 3px;
      }
      pre {
        overflow-x: auto;
        padding: 0.75em 1em;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        break-inside: avoid;
      }
      pre code { padding: 0; background: transparent; }

      /* ── Horizontal rule ─────────────────────────────────────────────────── */
      hr {
        border: 0;
        border-top: 1px solid #e5e7eb;
        margin: 1.4em 0;
      }

      /* ── Print-specific ──────────────────────────────────────────────────── */
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h2 { break-before: auto; }
        table { break-inside: avoid; }
        tr   { break-inside: avoid; }
        pre  { break-inside: avoid; }
        blockquote { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
${bodyHtml}
    </main>
  </body>
</html>`
}
