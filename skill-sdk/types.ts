import type { ZodTypeAny } from 'zod'

export type SkillToolOs = 'mac' | 'linux' | 'win'

/** Contract for a skill-owned tool in `actions/*.ts`. */
export interface SkillTool {
  name: string
  tags?: string[]
  description: string
  inputSchema?: ZodTypeAny
  os?: SkillToolOs
  needsApproval?: boolean
  execute: (input: Record<string, unknown>) => Promise<unknown>
}

export interface SkillToolModule {
  tools: SkillTool[]
  /**
   * Optional composer toolbar buttons for this skill (main-process handlers).
   * See `SkillComposerToolbarPlugin` in OpenFDE `src/main/skills/composer-toolbar-plugin.ts`.
   */
  composerToolbarPlugins?: unknown[]
}

export type SkillAttachmentContent = {
  content: string
  encoding: 'utf8' | 'base64'
  mimeType: string
}

export type MarkdownPdfDocumentKind = 'default' | 'research-report'

export type SandboxRequireResult =
  | { ok: true; root: string }
  | { ok: false; message: string }
