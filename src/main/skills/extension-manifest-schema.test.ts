import { describe, expect, it } from 'vitest'
import { parseExtensionManifest } from './extension-manifest-schema'

describe('parseExtensionManifest', () => {
  it('accepts a minimal manifest with only id and version', () => {
    const result = parseExtensionManifest({ id: 'secret-guard', version: '1.0.0' })
    expect(result).toEqual({
      ok: true,
      manifest: { id: 'secret-guard', version: '1.0.0' },
    })
  })

  it('accepts permissions, activationEvents, and command hooks', () => {
    const result = parseExtensionManifest({
      id: 'secret-guard',
      version: '1.0.0',
      permissions: { filesystem: 'workspace', shell: false, network: false },
      activationEvents: ['onStartup'],
      contributes: {
        hooks: {
          beforeToolCall: [{ type: 'command', command: './scripts/block.sh' }],
        },
      },
    })
    expect(result.ok).toBe(true)
  })

  it('accepts function, prompt, and agent hook bindings', () => {
    const result = parseExtensionManifest({
      id: 'multi-hook',
      version: '1.0.0',
      contributes: {
        hooks: {
          afterToolCall: [{ type: 'function', module: './actions/index.ts', export: 'hooks' }],
          preHook: [{ type: 'prompt', prompt: 'Is this safe?', model: 'claude-haiku-4-5' }],
          postHook: [{ type: 'agent', agentId: 'reviewer' }],
        },
      },
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a manifest missing id', () => {
    const result = parseExtensionManifest({ version: '1.0.0' })
    expect(result.ok).toBe(false)
  })

  it('rejects a manifest missing version', () => {
    const result = parseExtensionManifest({ id: 'secret-guard' })
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown hook event key', () => {
    const result = parseExtensionManifest({
      id: 'secret-guard',
      version: '1.0.0',
      contributes: {
        hooks: {
          NotARealEvent: [{ type: 'command', command: './x.sh' }],
        },
      },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown hook binding type', () => {
    const result = parseExtensionManifest({
      id: 'secret-guard',
      version: '1.0.0',
      contributes: {
        hooks: {
          beforeToolCall: [{ type: 'http', url: 'https://example.com' }],
        },
      },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-object payload', () => {
    expect(parseExtensionManifest(null).ok).toBe(false)
    expect(parseExtensionManifest('not-json').ok).toBe(false)
    expect(parseExtensionManifest(42).ok).toBe(false)
  })
})
