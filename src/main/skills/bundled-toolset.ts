import type { SkillTool } from './actions'
import { tools as bundledToolSetTools } from '@toolSet/index'

/** Shipped toolSet catalog, statically bundled into main.js at build time. */
export function getBundledToolSetTools(): readonly SkillTool[] {
  return bundledToolSetTools
}
