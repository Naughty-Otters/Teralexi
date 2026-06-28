import { computed, onMounted, onUnmounted, ref } from 'vue'

export type GoogleAccountSummary = {
  email: string
  name: string
  picture: string
}

export function useGoogleAccount() {
  const account = ref<GoogleAccountSummary | null>(null)

  async function refresh(): Promise<void> {
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
    void refresh()
  }

  function onGoogleAccountChanged(payload: { account: GoogleAccountSummary | null }) {
    account.value = payload.account
  }

  onMounted(() => {
    void refresh()
    window.addEventListener('focus', onWindowFocus)
    window.ipcRendererChannel?.GoogleAccountChanged?.on?.(onGoogleAccountChanged)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', onWindowFocus)
    window.ipcRendererChannel?.GoogleAccountChanged?.removeListener?.(
      onGoogleAccountChanged,
    )
  })

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
