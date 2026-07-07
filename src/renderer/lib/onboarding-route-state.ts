import {
  ONBOARDING_COMPLETED_KEY,
  getSystemConfigValues,
} from '@renderer/store/modules/agent/config'

let cachedOnboardingComplete: boolean | null = null

const ONBOARDING_CONFIG_TIMEOUT_MS = 8_000
const LOCAL_ONBOARDING_MIRROR_KEY = 'teralexi.onboarding.completed'

function readLocalOnboardingMirror(): boolean | null {
  try {
    const value = localStorage.getItem(LOCAL_ONBOARDING_MIRROR_KEY)
    if (value === '1') return true
    if (value === '0') return false
  } catch {
    // ignore storage failures
  }
  return null
}

function writeLocalOnboardingMirror(complete: boolean): void {
  try {
    localStorage.setItem(LOCAL_ONBOARDING_MIRROR_KEY, complete ? '1' : '0')
  } catch {
    // ignore storage failures
  }
}

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

/** Persist onboarding flag for synchronous router reads on next launch. */
export function syncOnboardingRouteMirror(complete: boolean): void {
  cachedOnboardingComplete = complete
  writeLocalOnboardingMirror(complete)
}

export async function isOnboardingComplete(): Promise<boolean> {
  if (cachedOnboardingComplete !== null) return cachedOnboardingComplete

  const localMirror = readLocalOnboardingMirror()
  if (localMirror !== null) {
    cachedOnboardingComplete = localMirror
    return localMirror
  }

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
  writeLocalOnboardingMirror(cachedOnboardingComplete)
  return cachedOnboardingComplete
}

export function markOnboardingCompleteInRouteCache(): void {
  syncOnboardingRouteMirror(true)
}

export function resetOnboardingRouteCache(): void {
  cachedOnboardingComplete = null
  try {
    localStorage.removeItem(LOCAL_ONBOARDING_MIRROR_KEY)
  } catch {
    // ignore storage failures
  }
}
