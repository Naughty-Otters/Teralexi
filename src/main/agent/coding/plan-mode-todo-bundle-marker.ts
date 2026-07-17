/**
 * Survives production minify + obfuscator (reservedStrings) so packaged
 * main-app.js can be verified to still include the planned-todo strategy.
 * Must never look like a filesystem import path under app.asar.
 */
export const PLANNED_TODO_STRATEGY_BUNDLE_MARKER =
  'teralexi:planned-todo-strategy-bundled'
