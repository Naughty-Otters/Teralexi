import { describe, expect, it, afterEach } from 'vitest'
import {
  clearAgentRunSandboxGlobals,
  getAgentRunSandboxOutputScope,
  getAgentRunSandboxRoot,
  OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  SANDBOX_ROOT_GLOBAL_KEY,
  setAgentRunSandboxGlobals,
  setAgentRunSandboxOutputScope,
  setAgentRunSandboxRoot,
} from './run-context'
import { runWithAgentRunScope } from '../run/run-scope'

describe('sandbox run-context', () => {
  afterEach(() => {
    clearAgentRunSandboxGlobals()
  })

  it('sets and clears sandbox globals', () => {
    setAgentRunSandboxGlobals({
      root: '/sandbox/root',
      outputScope: 'output/run-1',
    })
    expect(process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]).toBe('/sandbox/root')
    expect(process.env[OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]).toBe('output/run-1')
    expect((globalThis as Record<string, unknown>)[SANDBOX_ROOT_GLOBAL_KEY]).toBe(
      '/sandbox/root',
    )

    clearAgentRunSandboxGlobals()
    expect(process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]).toBeUndefined()
    expect(process.env[OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]).toBeUndefined()
    expect((globalThis as Record<string, unknown>)[SANDBOX_ROOT_GLOBAL_KEY]).toBeUndefined()
  })

  it('reads sandbox root and output scope from run scope and globals', async () => {
    await runWithAgentRunScope(
      {
        runId: 'run-1',
        depth: 0,
        sandboxRoot: '/scope/root',
        sandboxOutputScope: 'output/scope',
      },
      async () => {
        setAgentRunSandboxRoot('/scope/root')
        setAgentRunSandboxOutputScope('output/scope')
        expect(getAgentRunSandboxRoot()).toBe('/scope/root')
        expect(getAgentRunSandboxOutputScope()).toBe('output/scope')
      },
    )

    ;(globalThis as Record<string, unknown>)[SANDBOX_ROOT_GLOBAL_KEY] = '/global/root'
    ;(globalThis as Record<string, unknown>)[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY] =
      'output/global'
    expect(getAgentRunSandboxRoot()).toBe('/global/root')
    expect(getAgentRunSandboxOutputScope()).toBe('output/global')

    process.env[OTTER_AGENT_SANDBOX_ROOT_ENV] = '/env/root'
    delete (globalThis as Record<string, unknown>)[SANDBOX_ROOT_GLOBAL_KEY]
    expect(getAgentRunSandboxRoot()).toBe('/env/root')
  })
})
