/**
 * Skill-owned composer toolbar plugins (safe IPC / renderer view model).
 *
 * Skills register plugins in main (`composerToolbarPlugins` export). The
 * renderer only sees this serializable view + invoke-by-id.
 */

export type SkillComposerToolbarPluginView = {
  /** Stable id unique within the skill (e.g. `publish-website`). */
  id: string
  /** Button tooltip / aria-label. */
  label: string
  /**
   * Lucide icon leaf name, without the `i-lucide-` prefix
   * (e.g. `globe` → `i-lucide-globe`).
   */
  icon: string
  /** Whether the button should accept clicks. */
  enabled: boolean
  /** Optional reason shown in the tooltip when disabled. */
  disabledReason?: string
}

export type SkillComposerToolbarInvokeResult = {
  ok: boolean
  message?: string
  error?: string
}
