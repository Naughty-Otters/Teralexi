import {
  createStandardMarkdownIt,
  resolveDiagramBlocksInHtml,
} from '@shared/markdown/create-markdown-it'

import {
  pdfDocumentFontFaceCss,
  PDF_MONO_FONT_STACK,
  PDF_SANS_FONT_STACK,
} from './pdf-print-styles'

const markdown = createStandardMarkdownIt()

/** Full HTML document wrapping rendered markdown (for PDF export). */
export function renderMarkdownToHtmlDocument(markdownBody: string): string {
  const bodyHtml = resolveDiagramBlocksInHtml(markdown.render(markdownBody))
  return buildHtmlDocument(bodyHtml)
}

/** Full HTML document showing markdown source (raw preview mode). */
export function renderMarkdownSourceHtmlDocument(markdownBody: string): string {
  const escaped = markdownBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return buildHtmlDocument(`<pre class="markdown-raw">${escaped}</pre>`)
}

function buildHtmlDocument(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sandbox Result</title>
    <style>
      ${pdfDocumentFontFaceCss()}
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        font: 14px/1.6 ${PDF_SANS_FONT_STACK};
        color: #0f172a;
        background: #ffffff;
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 28px;
        background: #ffffff;
        border: 1px solid #dbe2ea;
        border-radius: 16px;
      }
      h1, h2, h3 { line-height: 1.25; }
      h1:first-child { margin-top: 0; }
      hr { border: 0; border-top: 1px solid #dbe2ea; margin: 24px 0; }
      a { color: #2563eb; }
      code, pre {
        font-family: ${PDF_MONO_FONT_STACK};
      }
      code {
        padding: 0.12rem 0.35rem;
        border-radius: 6px;
        background: #f1f5f9;
      }
      pre {
        overflow: auto;
        padding: 14px 16px;
        border-radius: 10px;
        background: #f1f5f9;
      }
      pre code {
        padding: 0;
        background: transparent;
      }
      pre.markdown-raw {
        margin: 0;
        padding: 0;
        background: transparent;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.5;
      }
      blockquote {
        margin-left: 0;
        padding-left: 14px;
        border-left: 3px solid #dbe2ea;
        color: #475569;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th, td {
        border: 1px solid #dbe2ea;
        padding: 8px 10px;
        text-align: left;
      }
      .diagram-block {
        margin: 16px 0;
        overflow-x: auto;
      }
      .diagram-block svg {
        display: block;
        max-width: 100%;
        height: auto;
      }
      .diagram-block--error {
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #fecaca;
        background: #fef2f2;
        color: #b91c1c;
        font-size: 13px;
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
