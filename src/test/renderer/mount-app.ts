import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import {
  markOnboardingCompleteInRouteCache,
  resetOnboardingRouteCache,
} from '@renderer/lib/onboarding-route-state'
import {
  installFakeIpcChannel,
  uninstallFakeIpcChannel,
  type FakeIpcChannel,
} from '../ipc/fake-ipc-channel'

export type MountedAppHarness = {
  pinia: Pinia
  router: Router
  ipc: FakeIpcChannel
}

const nuxtUiStub = {
  template: '<div class="nuxt-ui-stub"><slot /></div>',
}

export function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      {
        path: '/onboarding',
        name: 'onboarding',
        component: { template: '<div />' },
      },
    ],
  })
}

export function mountAppHarness(
  options: {
    ipc?: FakeIpcChannel
  } = {},
): MountedAppHarness {
  resetOnboardingRouteCache()
  markOnboardingCompleteInRouteCache()

  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createTestRouter()
  const ipc = options.ipc ?? installFakeIpcChannel()

  return { pinia, router, ipc }
}

export function teardownAppHarness(): void {
  resetOnboardingRouteCache()
  uninstallFakeIpcChannel()
}

export const vueGlobalStubs = {
  UButton: nuxtUiStub,
  UIcon: nuxtUiStub,
  UInput: nuxtUiStub,
  UTextarea: nuxtUiStub,
  USelect: nuxtUiStub,
  UModal: nuxtUiStub,
  UCard: nuxtUiStub,
  UBadge: nuxtUiStub,
  UTooltip: nuxtUiStub,
  UDropdownMenu: nuxtUiStub,
  UAvatar: nuxtUiStub,
  USkeleton: nuxtUiStub,
  UAlert: nuxtUiStub,
  UTabs: nuxtUiStub,
  UTab: nuxtUiStub,
  WorkspacePanel: { template: '<div class="workspace-panel-stub" />' },
  ReportPanel: { template: '<div class="report-panel-stub" />' },
  ChatPanelHeader: { template: '<div class="chat-panel-header-stub" />' },
  AgentGuidePanel: { template: '<div class="agent-guide-stub" />' },
  PanelResizeHandle: { template: '<div class="panel-resize-stub" />' },
}

export async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
