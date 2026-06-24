/** Non-LLM constants for the skills package. */

export const SKILLS_RESERVED_DIR_NAMES = [
  'common',
  '__pycache__',
  'node_modules',
] as const

export const SKILL_FILES = {
  SKILL_MD: 'skill.md',
  PROPERTIES_MD: 'properties.md',
  SUMMARY_MD: 'summary.md',
  /** @deprecated Legacy filename; use {@link SUMMARY_MD}. */
  LEGACY_SUMMARY_MD: 'analysis.md',
  REPORT_MD: 'report.md',
  ACTIONS_DIR: 'actions',
  TOOL_SET_DIR: 'toolSet',
} as const

export const SKILL_DEFAULT_PROPERTIES = {
  MODEL: 'gemma4',
  PROVIDER: 'ollama',
  COLOR: 'primary',
  ENABLED: true,
} as const

export const SKILL_LOADER_LOG = {
  SKIPPED_INVALID: 'Skipped skill folder: missing or invalid properties',
  SKIPPED_FAILED: 'Skipped skill folder: failed to load',
  LOADED: 'Loaded skills from directory',
} as const

export const SKILL_MODULE = {
  CACHE_DIR: '.electron-vite/skill-module-cache',
  /** Shipped prewarm output under {@link resolveAppRoot} when packaged. */
  PACKAGED_CACHE_DIR: 'dist/electron/skill-module-cache',
  /** Compiled JS aliases for user skill esbuild when packaged (no shipped `src/`). */
  COMPILE_RUNTIME_DIR: 'dist/electron/skill-compile-runtime',
  DEFAULT_TOOL_SET_TAG: 'toolSet',
} as const
