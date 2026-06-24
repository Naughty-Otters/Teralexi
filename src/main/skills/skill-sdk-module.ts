import * as skillSdk from '../../../skill-sdk'

/** Runtime module injected into dynamically compiled user skill actions. */
export function getSkillSdkModuleExports(): typeof skillSdk {
  return skillSdk
}
