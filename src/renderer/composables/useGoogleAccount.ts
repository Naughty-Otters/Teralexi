import { computed, onMounted, onUnmounted, ref } from 'vue'

export type GoogleAccountSummary = {
  email: string
  name: string
  picture: string
  workspaceAccess: boolean
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

  onMounted(() => {
    void refresh()
    window.addEventListener('focus', onWindowFocus)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', onWindowFocus)
  })

  return {
    account,
    refresh,
    isSignedIn: computed(() => account.value != null),
    hasWorkspaceAccess: computed(() => account.value?.workspaceAccess === true),
  }
}
