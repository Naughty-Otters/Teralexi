import { computed, onMounted, onUnmounted, ref } from 'vue'

export type GoogleAccountSummary = {
  email: string
  name: string
  picture: string
}

// Shared across all composable callers so sign-in from one panel updates the whole app.
const account = ref<GoogleAccountSummary | null>(null)
let listenerCount = 0

async function refreshGoogleAccount(): Promise<void> {
  const channel = window.ipcRendererChannel?.GetGoogleAccount
  if (!channel?.invoke) {
    account.value = null
    return
  }
  try {
    account.value = (await channel.invoke()) ?? null
  } catch {
    account.value = null
  }
}

function onWindowFocus() {
  void refreshGoogleAccount()
}

function onDocumentVisible() {
  if (document.visibilityState === 'visible') {
    void refreshGoogleAccount()
  }
}

function onGoogleAccountChanged(
  _event: unknown,
  payload: { account: GoogleAccountSummary | null },
) {
  account.value = payload?.account ?? null
}

function registerGoogleAccountListeners(): void {
  if (listenerCount === 0) {
    void refreshGoogleAccount()
    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onDocumentVisible)
    window.ipcRendererChannel?.GoogleAccountChanged?.on?.(onGoogleAccountChanged)
  }
  listenerCount += 1
}

function unregisterGoogleAccountListeners(): void {
  listenerCount = Math.max(0, listenerCount - 1)
  if (listenerCount === 0) {
    window.removeEventListener('focus', onWindowFocus)
    document.removeEventListener('visibilitychange', onDocumentVisible)
    window.ipcRendererChannel?.GoogleAccountChanged?.removeListener?.(
      onGoogleAccountChanged,
    )
  }
}

export function useGoogleAccount() {
  onMounted(() => {
    registerGoogleAccountListeners()
  })

  onUnmounted(() => {
    unregisterGoogleAccountListeners()
  })

  async function refresh(): Promise<void> {
    await refreshGoogleAccount()
  }

  async function signIn(): Promise<GoogleAccountSummary | null> {
    const channel = window.ipcRendererChannel?.GoogleSignIn
    if (!channel?.invoke) return null
    try {
      account.value = (await channel.invoke()) ?? null
      return account.value
    } catch {
      return null
    }
  }

  async function signOut(): Promise<void> {
    await window.ipcRendererChannel?.GoogleSignOut?.invoke?.()
    account.value = null
  }

  return {
    account,
    refresh,
    signIn,
    signOut,
    isSignedIn: computed(() => account.value != null),
  }
}
