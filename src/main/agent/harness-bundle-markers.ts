/**
 * Survives production minify + obfuscator (reservedStrings) so packaged
 * main-app.js can be verified to still include harness modules that were
 * previously at risk of being left as filesystem dynamic imports/requires.
 * Must never look like a filesystem import path under app.asar.
 */
export const EXECUTABLE_TOOL_REGISTRY_BUNDLE_MARKER =
  'teralexi:executable-tool-registry-bundled'

export const MID_LOOP_BUDGET_BUNDLE_MARKER =
  'teralexi:mid-loop-budget-bundled'

export const ACTIVE_TOOLS_TIER_BUNDLE_MARKER =
  'teralexi:active-tools-tier-bundled'
