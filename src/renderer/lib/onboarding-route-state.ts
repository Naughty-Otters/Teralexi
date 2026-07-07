import {
  ONBOARDING_COMPLETED_KEY,
  getSystemConfigValues,
} from '@renderer/store/modules/agent/config'

let cachedOnboardingComplete: boolean | null = null

const ONBOARDING_CONFIG_TIMEOUT_MS = 8_000

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      )
    }),
  ])
}

export async function isOnboardingComplete(): Promise<boolean> {
  if (cachedOnboardingComplete !== null) return cachedOnboardingComplete
  try {
    const values = await withTimeout(
      getSystemConfigValues([ONBOARDING_COMPLETED_KEY]),
      ONBOARDING_CONFIG_TIMEOUT_MS,
      'getSystemConfigValues(onboarding)',
    )
    cachedOnboardingComplete =
      values[ONBOARDING_COMPLETED_KEY] === 'true' ||
      values[ONBOARDING_COMPLETED_KEY] === '1'
  } catch {
    cachedOnboardingComplete = false
  }
  return cachedOnboardingComplete
}

export function markOnboardingCompleteInRouteCache(): void {
  cachedOnboardingComplete = true
}

export function resetOnboardingRouteCache(): void {
  cachedOnboardingComplete = null
}
