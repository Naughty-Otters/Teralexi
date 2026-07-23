import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  browserClick,
  browserFill,
  browserNavigate,
  browserSnapshot,
  browserTabs,
} from '@main/agent/browser/browser-session'

export const browserNavigateTool: SkillTool = {
  name: 'browser_navigate',
  tags: ['browser', 'web'],
  description:
    'Open a URL in the shared in-app browser panel (Cursor-like). Prefer this for interactive browsing; use web_scrape for one-shot markdown extraction.',
  inputSchema: z.object({
    url: z.string().min(1).describe('Absolute URL or hostname to open.'),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z.object({ url: z.string().min(1) }).safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.flatten() }
    const result = await browserNavigate(parsed.data.url)
    return { success: result.ok, ...result }
  },
}

export const browserSnapshotTool: SkillTool = {
  name: 'browser_snapshot',
  tags: ['browser', 'web'],
  description:
    'Capture an accessibility-style snapshot of the current in-app browser page with element refs for click/fill.',
  inputSchema: z.object({}),
  needsApproval: false,
  async execute() {
    const result = await browserSnapshot()
    return { success: result.ok, ...result }
  },
}

export const browserClickTool: SkillTool = {
  name: 'browser_click',
  tags: ['browser', 'web'],
  description:
    'Click an element in the in-app browser by ref from browser_snapshot (e.g. e12).',
  inputSchema: z.object({
    ref: z.string().min(1).describe('Element ref from browser_snapshot.'),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z.object({ ref: z.string().min(1) }).safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.flatten() }
    const result = await browserClick(parsed.data.ref)
    return { success: result.ok, ...result }
  },
}

export const browserFillTool: SkillTool = {
  name: 'browser_fill',
  tags: ['browser', 'web'],
  description:
    'Fill an input/textarea in the in-app browser by ref from browser_snapshot.',
  inputSchema: z.object({
    ref: z.string().min(1),
    value: z.string(),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z
      .object({ ref: z.string().min(1), value: z.string() })
      .safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.flatten() }
    const result = await browserFill(parsed.data.ref, parsed.data.value)
    return { success: result.ok, ...result }
  },
}

export const browserTabsTool: SkillTool = {
  name: 'browser_tabs',
  tags: ['browser', 'web'],
  description: 'List open in-app browser tabs (currently the active preview tab).',
  inputSchema: z.object({}),
  needsApproval: false,
  async execute() {
    const result = await browserTabs()
    return { success: result.ok, ...result }
  },
}

export const browserTools: SkillTool[] = [
  browserNavigateTool,
  browserSnapshotTool,
  browserClickTool,
  browserFillTool,
  browserTabsTool,
]
