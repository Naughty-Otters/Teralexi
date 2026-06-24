import {
  ONBOARDING_COMPLETED_KEY,
  getSystemConfigValues,
} from '@renderer/store/modules/agent/config'

let cachedOnboardingComplete: boolean | null = null

export async function isOnboardingComplete(): Promise<boolean> {
  if (cachedOnboardingComplete !== null) return cachedOnboardingComplete
  const values = await getSystemConfigValues([ONBOARDING_COMPLETED_KEY])
  cachedOnboardingComplete =
    values[ONBOARDING_COMPLETED_KEY] === 'true' ||
    values[ONBOARDING_COMPLETED_KEY] === '1'
  return cachedOnboardingComplete
}

export function markOnboardingCompleteInRouteCache(): void {
  cachedOnboardingComplete = true
}

export function resetOnboardingRouteCache(): void {
  cachedOnboardingComplete = null
}
