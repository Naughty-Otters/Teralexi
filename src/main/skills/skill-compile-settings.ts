import { getSystemPropValues } from '@config/system-prop'
import {
  parseSkillCompileSettings,
  SKILL_COMPILE_PROP_KEYS,
  type SkillCompileSettings,
} from '@shared/agent/skill-compile-settings'

export { SKILL_COMPILE_PROP_KEYS } from '@shared/agent/skill-compile-settings'

export function loadSkillCompileSettings(): SkillCompileSettings {
  const values = getSystemPropValues(Object.values(SKILL_COMPILE_PROP_KEYS))
  return parseSkillCompileSettings(values)
}
