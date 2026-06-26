import { computed, onMounted, onUnmounted, ref } from 'vue'

export type GoogleWorkspaceAccountSummary = {
  email: string
  name: string
  picture: string
  workspaceAccess: boolean
}

export function useGoogleWorkspaceAccount() {
  const account = ref<GoogleWorkspaceAccountSummary | null>(null)

  async function refresh(): Promise<void> {
    const channel = window.ipcRendererChannel?.GetGoogleWorkspaceAccount
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

  function onGoogleWorkspaceAccountChanged(payload: {
    account: GoogleWorkspaceAccountSummary | null
  }) {
    account.value = payload.account
  }

  onMounted(() => {
    void refresh()
    window.addEventListener('focus', onWindowFocus)
    window.ipcRendererChannel?.GoogleWorkspaceAccountChanged?.on?.(
      onGoogleWorkspaceAccountChanged,
    )
  })

  onUnmounted(() => {
    window.removeEventListener('focus', onWindowFocus)
    window.ipcRendererChannel?.GoogleWorkspaceAccountChanged?.removeListener?.(
      onGoogleWorkspaceAccountChanged,
    )
  })

  return {
    account,
    refresh,
    isSignedIn: computed(() => account.value != null),
    hasWorkspaceAccess: computed(
      () => account.value?.workspaceAccess === true,
    ),
  }
}
