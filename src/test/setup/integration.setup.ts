import { beforeEach, afterEach, vi } from 'vitest'
import { installFakeIpcChannel, uninstallFakeIpcChannel } from '../ipc/fake-ipc-channel'
import { resetOnboardingRouteCache } from '@renderer/lib/onboarding-route-state'
import { resetChatUiFlushState } from '@renderer/views/agent-chat/perf/scheduleUiFlush'

vi.mock('@renderer/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}))

export function integrationTestBeforeEach(): void {
  resetOnboardingRouteCache()
  resetChatUiFlushState()
  installFakeIpcChannel()
}

export function integrationTestAfterEach(): void {
  uninstallFakeIpcChannel()
  resetOnboardingRouteCache()
  resetChatUiFlushState()
}

beforeEach(integrationTestBeforeEach)
afterEach(integrationTestAfterEach)
