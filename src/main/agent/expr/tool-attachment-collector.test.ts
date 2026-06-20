import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { applyToolAttachmentCollection } from './tool-attachment-collector'

describe('applyToolAttachmentCollection', () => {
  it('collects attachments after successful execute', async () => {
    const root = mkdtempSync(join(tmpdir(), 'attach-'))
    const target = join(root, 'out.txt')
    writeFileSync(target, 'hello', 'utf8')

    const onAttachments = vi.fn()
    const toolSet: Record<string, unknown> = {
      write_file: {
        async execute() {
          return {
            written: true,
            path: target,
            sandboxRoot: root,
            size: 5,
          }
        },
      },
    }

    applyToolAttachmentCollection(toolSet, {
      getStepKey: () => 'step-1',
      getSandboxRoot: () => root,
      onAttachments,
    })

    await (toolSet.write_file as { execute: () => Promise<unknown> }).execute(
      {},
    )

    expect(onAttachments).toHaveBeenCalledTimes(1)
    expect(onAttachments.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        path: target,
        toolName: 'write_file',
      }),
    ])
  })

  it('collects pdf_path from export_research_pdf', async () => {
    const root = mkdtempSync(join(tmpdir(), 'attach-pdf-'))
    const pdfRel = 'output/results/topic-research-paper.pdf'
    const pdfAbs = join(root, pdfRel)
    mkdirSync(join(root, 'output', 'results'), { recursive: true })
    writeFileSync(pdfAbs, '%PDF-1.4 mock', 'utf8')

    const onAttachments = vi.fn()
    const toolSet: Record<string, unknown> = {
      export_research_pdf: {
        async execute() {
          return {
            success: true,
            pdf_path: pdfRel,
            filename: 'topic-research-paper.pdf',
          }
        },
      },
    }

    applyToolAttachmentCollection(toolSet, {
      getStepKey: () => 'step-1',
      getSandboxRoot: () => root,
      onAttachments,
    })

    await (
      toolSet.export_research_pdf as { execute: () => Promise<unknown> }
    ).execute({})

    expect(onAttachments).toHaveBeenCalledTimes(1)
    expect(onAttachments.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        path: pdfAbs,
        toolName: 'export_research_pdf',
        label: 'topic-research-paper.pdf',
      }),
    ])
  })

  it('does not collect when execute throws', async () => {
    const onAttachments = vi.fn()
    const toolSet: Record<string, unknown> = {
      fail_tool: {
        async execute() {
          throw new Error('boom')
        },
      },
    }

    applyToolAttachmentCollection(toolSet, {
      getStepKey: () => 'step-1',
      getSandboxRoot: () => undefined,
      onAttachments,
    })

    await expect(
      (toolSet.fail_tool as { execute: () => Promise<unknown> }).execute({}),
    ).rejects.toThrow('boom')

    expect(onAttachments).not.toHaveBeenCalled()
  })
})
