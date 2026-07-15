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

/** Pre-publish / pre-action confirmation payload (no side effects). */
export type SkillComposerToolbarPreviewResult = {
  ok: boolean
  error?: string
  /** Dialog title (e.g. "Publish website"). */
  title?: string
  /** Absolute site directory that will be packaged. */
  siteDir?: string
  /** Number of files that will be included in the zip. */
  fileCount?: number
  /** Uncompressed byte total of packable files (estimate). */
  estimatedBytes?: number
  /** First N relative file paths for the confirm dialog. */
  sampleFiles?: string[]
  /** Count of packable files not included in {@link sampleFiles}. */
  truncatedRemaining?: number
  /** API origin that will receive the upload. */
  targetHost?: string
  /** Upload API path (e.g. `api/v1/app/web/upload`). */
  uploadPath?: string
}

export type SkillComposerToolbarInvokeResult = {
  ok: boolean
  message?: string
  error?: string
  /** Present after a successful website publish. */
  absoluteUrl?: string
  /** Relative URL from the publish API (when available). */
  relativeUrl?: string
  /** Site directory that was packaged. */
  siteDir?: string
  /** Files reported by the publish API (or zip). */
  fileCount?: number
  /** Zip / upload bytes. */
  bytes?: number
  /** HTTP status from the upload response. */
  uploadStatus?: number
  /** HTTP status from the post-publish verify GET (0 = network failure). */
  verifyStatus?: number
}
