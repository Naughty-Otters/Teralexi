/** Set before navigating to `/` to open the LLM provider setup wizard once. */
export const PROVIDER_SETUP_SESSION_KEY = 'openfde.showProviderSetup'

export function requestProviderSetupWizardOnNextChatLoad(): void {
  try {
    sessionStorage.setItem(PROVIDER_SETUP_SESSION_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}
