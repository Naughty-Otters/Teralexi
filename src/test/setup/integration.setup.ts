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

beforeEach(() => {
  resetOnboardingRouteCache()
  resetChatUiFlushState()
  installFakeIpcChannel()
})

afterEach(() => {
  uninstallFakeIpcChannel()
  resetOnboardingRouteCache()
  resetChatUiFlushState()
})
