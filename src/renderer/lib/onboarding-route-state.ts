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

function parseOnboardingCompletedFlag(
  value: string | undefined,
): boolean {
  return value === 'true' || value === '1'
}

/** Persist onboarding flag for synchronous router reads on next launch. */
export function syncOnboardingRouteMirror(complete: boolean): void {
  cachedOnboardingComplete = complete
  writeLocalOnboardingMirror(complete)
}

/**
 * Prefer system config over the localStorage mirror so a stale `1` cannot
 * permanently skip first-run auth → setup → summary. Mirror is only a
 * fallback when config read times out / fails.
 */
export async function isOnboardingComplete(): Promise<boolean> {
  if (cachedOnboardingComplete !== null) return cachedOnboardingComplete

  try {
    const values = await withTimeout(
      getSystemConfigValues([ONBOARDING_COMPLETED_KEY]),
      ONBOARDING_CONFIG_TIMEOUT_MS,
      'getSystemConfigValues(onboarding)',
    )
    cachedOnboardingComplete = parseOnboardingCompletedFlag(
      values[ONBOARDING_COMPLETED_KEY],
    )
    writeLocalOnboardingMirror(cachedOnboardingComplete)
    return cachedOnboardingComplete
  } catch {
    const localMirror = readLocalOnboardingMirror()
    if (localMirror !== null) {
      cachedOnboardingComplete = localMirror
      return localMirror
    }
    cachedOnboardingComplete = false
    writeLocalOnboardingMirror(false)
    return false
  }
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
