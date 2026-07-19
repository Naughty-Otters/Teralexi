import { describe, expect, it } from 'vitest'
import {
  attachmentsFromOutputLinks,
  dedupeOutputLinks,
  dedupeStepAttachments,
  extractAttachmentsFromToolResult,
  mergeStepAttachments,
  outputLinkDedupeKey,
  pdfPreviewUrlFromAttachments,
  stepAttachmentsToOutputLinks,
  stepHasPdfAttachment,
  resolveFileChangePreviewsForAttachments,
  fileChangePreviewOpenUrl,
  type StepAttachment,
} from './step-attachment'

describe('extractAttachmentsFromToolResult', () => {
  it('extracts from write_file structured files', () => {
    const items = extractAttachmentsFromToolResult('write_file', {
      sandboxRoot: '/sandbox',
      written: true,
      path: '/sandbox/out/new.txt',
      size: 12,
      files: [
        {
          path: 'out/new.txt',
          diff: 'Index: out/new.txt\n--- out/new.txt\n+++ out/new.txt\n@@ -0,0 +1 @@\n+hi',
          additions: 1,
          deletions: 0,
          action: 'create',
        },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe('/sandbox/out/new.txt')
    expect(items[0]?.toolName).toBe('write_file')
    expect(items[0]?.action).toBe('create')
    expect(items[0]?.diff).toContain('+hi')
    expect(items[0]?.additions).toBe(1)
  })

  it('skips capture logs for run_script attachments', () => {
    const items = extractAttachmentsFromToolResult('run_script', {
      success: true,
      captureAbsolutePath: '/sandbox/output/toolLoop/x/results/capture-1.txt',
      resultReadFrom: 'output/toolLoop/x/results/capture-1.txt',
      sandboxRoot: '/sandbox',
    })
    expect(items.some((a) => a.path.includes('capture'))).toBe(false)
  })

  it('keeps non-capture resultReadFrom for legacy run_script results', () => {
    const items = extractAttachmentsFromToolResult('run_script', {
      success: true,
      captureAbsolutePath: '/sandbox/output/toolLoop/x/results/capture-1.txt',
      resultReadFrom: 'output/results/data.json',
      sandboxRoot: '/sandbox',
    })
    expect(items.some((a) => a.path.endsWith('output/results/data.json'))).toBe(
      true,
    )
    expect(items.some((a) => a.path.includes('capture'))).toBe(false)
  })

  it('prefers artifacts[] over capture for run_script attachments', () => {
    const items = extractAttachmentsFromToolResult('run_script', {
      success: true,
      sandboxRoot: '/sandbox',
      captureAbsolutePath: '/sandbox/output/toolLoop/x/results/capture-1.txt',
      artifacts: [
        { role: 'script', path: '/sandbox/scripts/run.py', relPath: 'scripts/run.py' },
        {
          role: 'capture',
          path: '/sandbox/output/toolLoop/x/results/capture-1.txt',
          relPath: 'output/toolLoop/x/results/capture-1.txt',
        },
        {
          role: 'primary',
          path: '/sandbox/output/toolLoop/x/results/report.md',
          relPath: 'output/toolLoop/x/results/report.md',
        },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toContain('report.md')
    expect(items[0]?.label).toContain('primary')
    expect(items.some((a) => a.path.includes('capture'))).toBe(false)
  })

  it('skips errors and deletes in step attachment bubbles', () => {
    expect(
      extractAttachmentsFromToolResult('write_file', { error: 'fail' }),
    ).toEqual([])
    expect(
      extractAttachmentsFromToolResult('delete_file', {
        sandboxRoot: '/sandbox',
        workspacePath: '/project',
        files: [
          {
            path: 'gone.txt',
            diff: '--- gone.txt\n+++ /dev/null\n@@ -1 +0 @@\n-x',
            additions: 0,
            deletions: 1,
            action: 'delete',
            workspacePath: '/project',
          },
        ],
      }),
    ).toEqual([])
  })

  it('still extracts sandbox-only file creates and edits', () => {
    const created = extractAttachmentsFromToolResult('write_file', {
      sandboxRoot: '/sandbox',
      files: [
        {
          path: 'output/report.html',
          diff: '--- output/report.html\n+++ output/report.html\n@@ -0,0 +1 @@\n+<html>',
          additions: 1,
          deletions: 0,
          action: 'create',
        },
      ],
    })
    expect(created).toHaveLength(1)
    expect(created[0]?.path).toBe('/sandbox/output/report.html')
    expect(created[0]?.displayPath).toBe('output/report.html')
    expect(created[0]?.url).toMatch(/^file:\/\//)

    const edited = extractAttachmentsFromToolResult('edit_file', {
      sandboxRoot: '/sandbox',
      files: [
        {
          path: 'notes.md',
          diff: '--- notes.md\n+++ notes.md\n@@ -1 +1 @@\n-old\n+new',
          action: 'modify',
          additions: 1,
          deletions: 1,
        },
      ],
    })
    expect(edited).toHaveLength(1)
    expect(edited[0]?.path).toBe('/sandbox/notes.md')
  })

  it('extracts written path without diff', () => {
    const items = extractAttachmentsFromToolResult('write_file', {
      sandboxRoot: '/sandbox',
      written: true,
      path: '/sandbox/binary.dat',
      size: 100,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe('/sandbox/binary.dat')
    expect(items[0]?.sizeBytes).toBe(100)
  })

  it('extracts edit_file file-change previews with line stats', () => {
    const items = extractAttachmentsFromToolResult('edit_file', {
      sandboxRoot: '/sandbox',
      files: [
        {
          path: 'notes.md',
          diff: '--- notes.md\n+++ notes.md\n@@ -1 +1 @@\n-old\n+new',
          action: 'modify',
          additions: 1,
          deletions: 1,
        },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe('/sandbox/notes.md')
    expect(items[0]?.additions).toBe(1)
    expect(items[0]?.deletions).toBe(1)
  })

  it('resolves workspace file changes against workspace root not sandbox', () => {
    const items = extractAttachmentsFromToolResult('edit_file', {
      sandboxRoot: '/sandbox',
      workspacePath: '/project',
      files: [
        {
          path: 'src/app.ts',
          diff: '--- src/app.ts\n+++ src/app.ts\n@@ -1 +1 @@\n-old\n+new',
          action: 'modify',
          additions: 1,
          deletions: 1,
          workspacePath: '/project',
        },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe('/project/src/app.ts')
    expect(items[0]?.url).toBe('file:///project/src/app.ts')
  })

  it('skips failed tool results and non-success scripts', () => {
    expect(
      extractAttachmentsFromToolResult('write_file', { success: false }),
    ).toEqual([])
    expect(
      extractAttachmentsFromToolResult('write_file', { ok: false }),
    ).toEqual([])
    expect(
      extractAttachmentsFromToolResult('write_file', { written: false }),
    ).toEqual([])
    expect(
      extractAttachmentsFromToolResult('run_script', { success: false }),
    ).toEqual([])
  })

  it('handles relative paths and rename rows in files array', () => {
    const items = extractAttachmentsFromToolResult('write_file', {
      sandboxRoot: '/sandbox',
      files: [
        {
          path: 'rel/rename.txt',
          action: 'rename',
        },
        {
          path: 'C:\\sandbox\\abs.txt',
          action: 'modify',
        },
      ],
    })
    expect(items.some((a) => a.path.endsWith('rel/rename.txt'))).toBe(true)
    expect(items.some((a) => a.action === 'rename')).toBe(true)
  })

  it('extracts pdf_path from export_research_pdf success result', () => {
    const items = extractAttachmentsFromToolResult('export_research_pdf', {
      success: true,
      sandboxRoot: '/sandbox',
      pdf_path: 'output/results/river-otters-research-paper.pdf',
      filename: 'river-otters-research-paper.pdf',
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe(
      '/sandbox/output/results/river-otters-research-paper.pdf',
    )
    expect(items[0]?.label).toBe('river-otters-research-paper.pdf')
    expect(items[0]?.url).toMatch(/^file:\/\//)
  })

  it('extracts file_path from render_document success result', () => {
    const items = extractAttachmentsFromToolResult('render_document', {
      success: true,
      file_path: '/sandbox/output/results/report.pdf',
      format: 'pdf',
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe('/sandbox/output/results/report.pdf')
  })

  it('returns empty for invalid or empty results', () => {
    expect(extractAttachmentsFromToolResult('write_file', null)).toEqual([])
    expect(extractAttachmentsFromToolResult('write_file', [])).toEqual([])
  })
})

describe('mergeStepAttachments', () => {
  it('dedupes by path and merges newer fields', () => {
    const a: StepAttachment = {
      path: '/sandbox/a.txt',
      label: 'a.txt',
      toolName: 'write_file',
    }
    const b: StepAttachment = {
      path: '/sandbox/a.txt',
      label: 'a.txt',
      toolName: 'edit_file',
      sizeBytes: 5,
    }
    const merged = mergeStepAttachments([a], [b])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.toolName).toBe('edit_file')
    expect(merged[0]?.sizeBytes).toBe(5)
  })
})

describe('dedupeOutputLinks', () => {
  it('dedupes by label when url is empty', () => {
    const key = outputLinkDedupeKey({ label: '/same/path.txt', url: '' })
    expect(key).toBe('/same/path.txt')
    const links = dedupeOutputLinks([
      { label: '/same/path.txt', url: '' },
      { label: '/same/path.txt', url: '' },
    ])
    expect(links).toHaveLength(1)
  })

  it('handles file urls without host slash and invalid percent encoding', () => {
    expect(
      outputLinkDedupeKey({
        label: 'doc.pdf',
        url: 'file://sandbox/doc.pdf',
      }),
    ).toBeTruthy()
    const badEncoding = dedupeOutputLinks([
      { label: 'x', url: 'file://%E0%A4%A' },
      { label: 'x', url: 'file://%E0%A4%A' },
    ])
    expect(badEncoding).toHaveLength(1)
  })

  it('merges links that point at the same file via different file URLs', () => {
    const links = dedupeOutputLinks([
      {
        label: 'report.html',
        url: 'file:///sandbox/output/report.html',
      },
      {
        label: 'report.html',
        url: 'file://sandbox/output/report.html',
      },
    ])
    expect(links).toHaveLength(1)
    expect(links[0]?.label).toBe('report.html')
  })
})

describe('attachmentsFromOutputLinks and pdf helpers', () => {
  it('converts legacy output links and detects pdf', () => {
    const attachments = attachmentsFromOutputLinks([
      { label: 'report.pdf', url: 'file:///sandbox/report.pdf' },
      { label: '', url: '' },
    ])
    expect(attachments).toHaveLength(1)
    expect(stepHasPdfAttachment(attachments)).toBe(true)
    expect(pdfPreviewUrlFromAttachments(attachments)).toContain('.pdf')
    expect(stepHasPdfAttachment([])).toBe(false)
  })
})

describe('dedupeStepAttachments', () => {
  it('dedupes relative and absolute paths for the same file', () => {
    const out = dedupeStepAttachments([
      { path: 'sandbox/a.txt', label: 'a.txt' },
      { path: '/sandbox/a.txt', label: 'a.txt', url: 'file:///sandbox/a.txt' },
    ])
    expect(out).toHaveLength(1)
  })
})

describe('stepAttachmentsToOutputLinks', () => {
  it('includes diff stats in shortcut labels', () => {
    const links = stepAttachmentsToOutputLinks([
      {
        path: '/project/src/app.ts',
        label: 'app.ts',
        displayPath: 'src/app.ts',
        url: 'file:///project/src/app.ts',
        additions: 3,
        deletions: 1,
      },
    ])
    expect(links[0]?.label).toBe('src/app.ts +3 −1')
  })

  it('builds file urls for windows paths when url omitted', () => {
    const links = stepAttachmentsToOutputLinks([
      { path: 'C:\\sandbox\\out.txt', label: 'out.txt' },
    ])
    expect(links[0]?.url).toMatch(/^file:\/\//)
  })

  it('maps attachments to file links', () => {
    const links = stepAttachmentsToOutputLinks([
      {
        path: '/sandbox/out/report.pdf',
        label: 'report.pdf',
        url: 'file:///sandbox/out/report.pdf',
      },
    ])
    expect(links).toEqual([
      {
        label: 'report.pdf',
        url: 'file:///sandbox/out/report.pdf',
      },
    ])
  })
})

describe('resolveFileChangePreviewsForAttachments', () => {
  it('uses diffs stored on attachments', () => {
    const previews = resolveFileChangePreviewsForAttachments(
      [
        {
          path: '/project/src/app.ts',
          label: 'app.ts',
          displayPath: 'src/app.ts',
          additions: 1,
          deletions: 1,
          diff: '@@ -1 +1 @@\n-old\n+new',
          action: 'modify',
        },
      ],
      [],
    )
    expect(previews).toHaveLength(1)
    expect(previews[0]?.path).toBe('src/app.ts')
    expect(previews[0]?.diff).toContain('+new')
  })

  it('falls back to matching tool file changes by path', () => {
    const previews = resolveFileChangePreviewsForAttachments(
      [
        {
          path: '/project/src/app.ts',
          label: 'app.ts',
          displayPath: 'src/app.ts',
          additions: 1,
          deletions: 1,
        },
      ],
      [
        {
          path: 'src/app.ts',
          diff: '@@ -1 +1 @@\n-old\n+new',
          additions: 1,
          deletions: 1,
          action: 'modify',
        },
      ],
    )
    expect(previews).toHaveLength(1)
    expect(previews[0]?.diff).toContain('+new')
  })
})

describe('fileChangePreviewOpenUrl', () => {
  it('builds file:// URLs for js and html the same way', () => {
    expect(
      fileChangePreviewOpenUrl({
        path: 'src/app.js',
        workspacePath: '/Users/me/project',
      }),
    ).toBe('file:///Users/me/project/src/app.js')
    expect(
      fileChangePreviewOpenUrl({
        path: 'index.html',
        workspacePath: '/Users/me/project',
      }),
    ).toBe('file:///Users/me/project/index.html')
  })

  it('uses fallback workspace path when preview omits workspacePath', () => {
    expect(
      fileChangePreviewOpenUrl({ path: 'src/a.ts' }, '/ws'),
    ).toBe('file:///ws/src/a.ts')
  })

  it('returns undefined for deletes and unresolved relative paths', () => {
    expect(
      fileChangePreviewOpenUrl({
        path: 'gone.js',
        workspacePath: '/ws',
        action: 'delete',
      }),
    ).toBeUndefined()
    expect(fileChangePreviewOpenUrl({ path: 'relative/only.js' })).toBeUndefined()
  })
})
