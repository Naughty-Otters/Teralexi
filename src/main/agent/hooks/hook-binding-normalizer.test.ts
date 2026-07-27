import { describe, expect, it, vi } from 'vitest'
import {
  normalizeExtensionHooksFile,
  normalizeFlatHooksFile,
  normalizeManifestHooks,
  normalizeModuleHooks,
} from './hook-binding-normalizer'

describe('hook-binding-normalizer', () => {
  it('normalizes flat hooks.json array format', () => {
    const bindings = normalizeFlatHooksFile(
      {
        hooks: [{ event: 'preHook', command: 'node', args: ['hook.js'] }],
      },
      'global-hooks-json',
    )
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      type: 'command',
      event: 'preHook',
      command: 'node',
    })
  })

  it('normalizes extension hooks map format with aliases', () => {
    const bindings = normalizeExtensionHooksFile(
      {
        hooks: {
          PreToolUse: [{ type: 'command', command: './block.sh' }],
        },
      },
      'extension-hooks-json',
      'secret-guard',
    )
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      event: 'beforeToolCall',
      command: './block.sh',
      extensionId: 'secret-guard',
    })
  })

  it('normalizes manifest contributes.hooks', () => {
    const bindings = normalizeManifestHooks(
      {
        beforeToolCall: [{ type: 'command', command: '/bin/check' }],
      },
      'extension-manifest',
      'ext1',
    )
    expect(bindings[0]?.command).toBe('/bin/check')
  })

  it('normalizes module export hooks', () => {
    const handler = vi.fn(async () => ({ continue: true }))
    const bindings = normalizeModuleHooks(
      { afterToolCall: handler },
      'extension-module',
      'ext1',
    )
    expect(bindings).toHaveLength(1)
    expect(bindings[0]?.type).toBe('function')
  })

  it('normalizes prompt and agent bindings from manifest', () => {
    const bindings = normalizeManifestHooks(
      {
        beforeToolCall: [
          { type: 'prompt', prompt: 'Block secrets', model: 'openai:gpt-4o-mini' },
          { type: 'agent', agentId: 'coding' },
        ],
      },
      'extension-manifest',
      'ext1',
    )
    expect(bindings).toHaveLength(2)
    expect(bindings[0]).toMatchObject({
      type: 'prompt',
      prompt: 'Block secrets',
      model: 'openai:gpt-4o-mini',
    })
    expect(bindings[1]).toMatchObject({
      type: 'agent',
      agentId: 'coding',
    })
  })

  it('normalizes function-ref bindings from hooks map', () => {
    const bindings = normalizeExtensionHooksFile(
      {
        hooks: {
          beforeToolCall: [
            { type: 'function', module: './hooks/block', export: 'beforeToolCall' },
          ],
        },
      },
      'extension-hooks-json',
      'ext1',
    )
    expect(bindings[0]).toMatchObject({
      type: 'function-ref',
      module: './hooks/block',
      export: 'beforeToolCall',
    })
  })
})
