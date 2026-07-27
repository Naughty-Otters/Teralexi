import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadExtensionManifest } from './extension-manifest'

describe('loadExtensionManifest', () => {
  let extensionDir: string

  beforeEach(async () => {
    extensionDir = await mkdtemp(join(tmpdir(), 'extension-manifest-'))
  })

  it('returns null when extension.json does not exist', () => {
    expect(loadExtensionManifest(extensionDir)).toBeNull()
  })

  it('returns null and does not throw on malformed JSON', async () => {
    await writeFile(join(extensionDir, 'extension.json'), '{ not valid json')
    expect(loadExtensionManifest(extensionDir)).toBeNull()
  })

  it('returns null when the manifest fails schema validation', async () => {
    await writeFile(
      join(extensionDir, 'extension.json'),
      JSON.stringify({ version: '1.0.0' }),
    )
    expect(loadExtensionManifest(extensionDir)).toBeNull()
  })

  it('returns the parsed manifest for a valid extension.json', async () => {
    await writeFile(
      join(extensionDir, 'extension.json'),
      JSON.stringify({
        id: 'secret-guard',
        version: '1.0.0',
        permissions: { filesystem: 'workspace' },
        contributes: {
          hooks: {
            beforeToolCall: [{ type: 'command', command: './scripts/block.sh' }],
          },
        },
      }),
    )
    expect(loadExtensionManifest(extensionDir)).toEqual({
      id: 'secret-guard',
      version: '1.0.0',
      permissions: { filesystem: 'workspace' },
      contributes: {
        hooks: {
          beforeToolCall: [{ type: 'command', command: './scripts/block.sh' }],
        },
      },
    })
  })
})
