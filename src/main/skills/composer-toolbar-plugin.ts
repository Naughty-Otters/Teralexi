import type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPluginView,
} from '@shared/agent/skill-composer-toolbar'

/**
 * Context passed to skill toolbar plugin enable checks and execute handlers.
 * Runs in the main process (same as skill action tools).
 */
export type SkillComposerToolbarPluginContext = {
  skillId: string
  conversationId: string
  workspacePath?: string | null
}

/**
 * Skill-owned composer toolbar button. Export from `actions/index.ts` as
 * `composerToolbarPlugins: SkillComposerToolbarPlugin[]`.
 */
export type SkillComposerToolbarPlugin = {
  id: string
  label: string
  /** Lucide leaf icon name (`globe` → `i-lucide-globe` in the UI). */
  icon: string
  /**
   * Whether the button is enabled. Default: always enabled when listed.
   * Called when the renderer refreshes the toolbar for the active skill.
   */
  isEnabled?: (
    ctx: SkillComposerToolbarPluginContext,
  ) => boolean | Promise<boolean>
  /** Optional tooltip when {@link isEnabled} returns false. */
  getDisabledReason?: (
    ctx: SkillComposerToolbarPluginContext,
  ) => string | undefined | Promise<string | undefined>
  /** Click handler — run the skill-owned action. */
  execute: (
    ctx: SkillComposerToolbarPluginContext,
  ) => Promise<SkillComposerToolbarInvokeResult>
}

export type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPluginView,
}
