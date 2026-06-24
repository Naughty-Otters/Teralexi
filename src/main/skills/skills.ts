/**
 * Skill Framework
 *
 *   <bundled>/skills/       ← shipped defaults (repo or app bundle)
 *   <bundled>/toolSet/      ← shared tools merged into every skill (sibling of skills/)
 *   ~/.openfde/skills/       ← user skill overrides (`getSkillsDir()`)
 *   ~/.openfde/toolSet/      ← user tool overrides (`getopenfdeToolSetDir()`)
 *     my-skill/             ← one folder = one skill when `skill.md` exists
 *       skill.md              ← required marker file
 *       properties.md         ← optional: key:value skill metadata
 */

import { createLogger, traceFunction } from '@main/logger'
import { resolveUserSkillsDirectory } from './skill-path'
import { parseSkillMarkdown as parseSkillMarkdownCore } from './skill-markdown'
import {
  loadSkillActions,
  loadSkillActionsForSkillId,
  loadToolSetTools,
  loadToolSetToolsFromDirectory,
} from './skill-module-loader'
import { loadSkills, loadSkillsFromDirectory } from './skills-directory-loader'
import { skillToAgent as skillToAgentCore } from './skill-serializer'

export type { SkillColor, SkillProvider } from './types'
export type {
  SkillProperties,
  SkillConstraint,
  SkillGuardRail,
  SkillExample,
  SkillSections,
  SkillTool,
  SkillToolOs,
  ConstraintSeverity,
  GuardRailAction,
} from './types'
export type { SkillDefinition, SkillAgent } from './skill-models'
export { runAgent } from './actions'

export {
  loadSkillActions,
  loadSkillActionsForSkillId,
  loadToolSetTools,
  loadToolSetToolsFromDirectory,
  loadSkillsFromDirectory,
  loadSkills,
}
export {
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_RUNTIME_SKILL_ID,
  filterChatVisibleSkills,
  filterWorkflowPanelSkills,
  isWorkflowPanelSkill,
} from './skill-visibility'

const log = createLogger('skills.skills')

/** User skills install path (`~/.openfde/skills`). Use {@link loadSkills} for merged catalog. */
export const getSkillsDir = traceFunction(
  log,
  'getSkillsDir',
  resolveUserSkillsDirectory,
)

export const parseSkillMarkdown = traceFunction(
  log,
  'parseSkillMarkdown',
  parseSkillMarkdownCore,
)

export const skillToAgent = traceFunction(log, 'skillToAgent', skillToAgentCore)
