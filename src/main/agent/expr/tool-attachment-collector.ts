/**
 * Collects file attachments from tool execute results onto the active step instance.
 * Apply after applyToolOutputTruncation and alongside applyToolResultRecording.
 */

import { statSync } from 'node:fs'
import { createLogger } from '@main/logger'
import {
  extractAttachmentsFromToolResult,
  type StepAttachment,
} from '@shared/agent/step-attachment'

const log = createLogger('agent.expr.tool-attachment-collector')

export interface ToolAttachmentCollectionCtx {
  getStepKey: () => string
  getSandboxRoot: () => string | undefined
  onAttachments: (items: StepAttachment[]) => void
}

function filterExistingFiles(
  items: StepAttachment[],
  sandboxRoot?: string,
): StepAttachment[] {
  if (!sandboxRoot?.trim()) return items
  return items.filter((item) => {
    try {
      const st = statSync(item.path)
      return st.isFile()
    } catch {
      return false
    }
  })
}

export function applyToolAttachmentCollection(
  toolSet: Record<string, unknown>,
  ctx: ToolAttachmentCollectionCtx,
): void {
  for (const name of Object.keys(toolSet)) {
    const spec = toolSet[name] as Record<string, unknown> | null
    if (!spec || typeof spec['execute'] !== 'function') continue

    const origExecute = (spec['execute'] as (...a: unknown[]) => Promise<unknown>).bind(
      spec,
    )

    spec['execute'] = async (input: unknown): Promise<unknown> => {
      let result: unknown
      let threw = false

      try {
        result = await origExecute(input)
      } catch (err) {
        threw = true
        throw err
      } finally {
        if (!threw) {
          try {
            const sandboxRoot = ctx.getSandboxRoot()
            const extracted = extractAttachmentsFromToolResult(
              name,
              result,
              sandboxRoot,
            )
            const items = filterExistingFiles(extracted, sandboxRoot)
            if (items.length > 0) {
              ctx.onAttachments(items)
            }
          } catch (collectErr) {
            log.warn('Failed to collect tool attachments', {
              toolName: name,
              stepKey: ctx.getStepKey(),
              collectErr,
            })
          }
        }
      }

      return result
    }
  }
}
