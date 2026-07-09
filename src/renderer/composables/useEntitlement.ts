import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { EntitlementUiSnapshot } from '@shared/subscription/entitlement-types'
import { isAuthorizationBlocked } from '@shared/subscription/entitlement-auth-error'
import { hasEntitlementFeature } from '@shared/subscription/entitlement-features'

const entitlement = ref<EntitlementUiSnapshot | null>(null)
const refreshing = ref(false)
let listenerCount = 0

async function readEntitlementSnapshot(): Promise<EntitlementUiSnapshot | null> {
  const channel = window.ipcRendererChannel?.GetEntitlement
  if (!channel?.invoke) {
    entitlement.value = null
    return null
  }
  try {
    entitlement.value = (await channel.invoke()) ?? null
    return entitlement.value
  } catch {
    entitlement.value = null
    return null
  }
}

async function refreshEntitlementFromServer(): Promise<EntitlementUiSnapshot | null> {
  const channel = window.ipcRendererChannel?.RefreshEntitlement
  if (!channel?.invoke) {
    return readEntitlementSnapshot()
  }
  refreshing.value = true
  try {
    entitlement.value = (await channel.invoke()) ?? null
    return entitlement.value
  } catch {
    await readEntitlementSnapshot()
    return entitlement.value
  } finally {
    refreshing.value = false
  }
}

function onEntitlementChanged(
  _event: unknown,
  payload: { entitlement: EntitlementUiSnapshot | null },
) {
  entitlement.value = payload?.entitlement ?? null
}

function registerEntitlementListeners(): void {
  if (listenerCount === 0) {
    void readEntitlementSnapshot()
    window.ipcRendererChannel?.EntitlementChanged?.on?.(onEntitlementChanged)
  }
  listenerCount += 1
}

function unregisterEntitlementListeners(): void {
  listenerCount = Math.max(0, listenerCount - 1)
  if (listenerCount === 0) {
    window.ipcRendererChannel?.EntitlementChanged?.removeListener?.(
      onEntitlementChanged,
    )
  }
}

export function useEntitlement() {
  onMounted(() => {
    registerEntitlementListeners()
  })

  onUnmounted(() => {
    unregisterEntitlementListeners()
  })

  function hasFeature(feature: string): boolean {
    return hasEntitlementFeature(entitlement.value, feature)
  }

  return {
    entitlement,
    refreshing,
    refresh: readEntitlementSnapshot,
    refreshFromServer: refreshEntitlementFromServer,
    hasFeature,
    isEntitled: computed(
      () =>
        entitlement.value != null &&
        entitlement.value.verifyState !== 'failed' &&
        entitlement.value.verifyState !== 'unsigned',
    ),
    isAuthorizationBlocked: computed(() =>
      isAuthorizationBlocked(entitlement.value),
    ),
    authorizationErrorMessage: computed(
      () => entitlement.value?.errorMessage ?? null,
    ),
  }
}
