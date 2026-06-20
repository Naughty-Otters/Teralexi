import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeMessage, MessageBuffer } from './json-rpc'
import type { LanguageServerDef } from './language-servers'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

vi.mock('./language-servers', () => ({
  resolveServerCommand: () => 'mock-language-server',
  buildServerPath: () => process.env.PATH ?? '',
}))

import { LspClient } from './lsp-client'

const serverDef: LanguageServerDef = {
  id: 'typescript',
  command: 'typescript-language-server',
  args: ['--stdio'],
  extensions: ['.ts'],
}

type MockProc = EventEmitter & {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  killed: boolean
  kill: ReturnType<typeof vi.fn>
}

function createMockProc(responder: (msg: { id?: number; method?: string; params?: unknown }) => void) {
  const proc = new EventEmitter() as MockProc
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const inbound = new MessageBuffer()

  stdin.on('data', (chunk: Buffer) => {
    for (const msg of inbound.push(chunk)) {
      responder(msg)
    }
  })

  proc.stdin = stdin
  proc.stdout = stdout
  proc.stderr = stderr
  proc.killed = false
  proc.kill = vi.fn(() => {
    proc.killed = true
  })

  setImmediate(() => proc.emit('spawn'))
  return { proc, stdout }
}

describe('LspClient', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes and returns diagnostics after publishDiagnostics', async () => {
    const { proc, stdout } = createMockProc((msg) => {
      if (msg.method === 'initialize' && msg.id != null) {
        stdout.write(
          encodeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            result: { capabilities: {} },
          }),
        )
      }
      if (msg.method === 'textDocument/didOpen') {
        const uri = (msg.params as { textDocument?: { uri?: string } })?.textDocument?.uri
        if (uri) {
          setImmediate(() => {
            stdout.write(
              encodeMessage({
                jsonrpc: '2.0',
                method: 'textDocument/publishDiagnostics',
                params: {
                  uri,
                  diagnostics: [
                    {
                      range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 1 },
                      },
                      severity: 1,
                      message: 'Type error',
                    },
                  ],
                },
              }),
            )
          })
        }
      }
    })
    spawnMock.mockReturnValue(proc)

    const client = new LspClient(serverDef, '/workspace')
    await client.start()

    const diagnostics = await client.getDiagnostics(
      '/workspace/src/a.ts',
      'const x: number = "bad"',
      'typescript',
    )

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.message).toBe('Type error')
    client.dispose()
  })

  it('sends didChange on subsequent document updates', async () => {
    const seenMethods: string[] = []
    const { proc, stdout } = createMockProc((msg) => {
      if (msg.method) seenMethods.push(msg.method)
      if (msg.method === 'initialize' && msg.id != null) {
        stdout.write(
          encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }),
        )
      }
      if (msg.method === 'textDocument/didOpen' || msg.method === 'textDocument/didChange') {
        const uri = (msg.params as { textDocument?: { uri?: string } })?.textDocument?.uri
        if (uri) {
          setImmediate(() => {
            stdout.write(
              encodeMessage({
                jsonrpc: '2.0',
                method: 'textDocument/publishDiagnostics',
                params: { uri, diagnostics: [] },
              }),
            )
          })
        }
      }
    })
    spawnMock.mockReturnValue(proc)

    const client = new LspClient(serverDef, '/workspace')
    await client.start()
    await client.getDiagnostics('/workspace/a.ts', 'v1', 'typescript')
    await client.getDiagnostics('/workspace/a.ts', 'v2', 'typescript')

    expect(seenMethods.filter((m) => m === 'textDocument/didOpen')).toHaveLength(1)
    expect(seenMethods.filter((m) => m === 'textDocument/didChange')).toHaveLength(1)
    client.dispose()
  })

  it('lspRequest resolves server responses', async () => {
    const { proc, stdout } = createMockProc((msg) => {
      if (msg.method === 'initialize' && msg.id != null) {
        stdout.write(
          encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }),
        )
      }
      if (msg.method === 'textDocument/hover' && msg.id != null) {
        stdout.write(
          encodeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            result: { contents: { value: 'hover text' } },
          }),
        )
      }
    })
    spawnMock.mockReturnValue(proc)

    const client = new LspClient(serverDef, '/workspace')
    await client.start()
    const uri = await client.openDocument('/workspace/a.ts', 'const x = 1', 'typescript')
    const result = await client.lspRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line: 0, character: 6 },
    })

    expect(result).toEqual({ contents: { value: 'hover text' } })
    client.dispose()
  })

  it('replies to server-initiated workspace/configuration requests', async () => {
    const stdinWrites: string[] = []
    const { proc, stdout } = createMockProc((msg) => {
      if (msg.method === 'initialize' && msg.id != null) {
        stdout.write(
          encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }),
        )
        stdout.write(
          encodeMessage({
            jsonrpc: '2.0',
            id: 99,
            method: 'workspace/configuration',
            params: { items: [{ section: 'typescript' }] },
          }),
        )
      }
    })
    proc.stdin.on('data', (chunk: Buffer) => {
      stdinWrites.push(chunk.toString('utf8'))
    })
    spawnMock.mockReturnValue(proc)

    const client = new LspClient(serverDef, '/workspace')
    await client.start()
    await vi.waitFor(() => {
      expect(stdinWrites.some((w) => w.includes('"id":99'))).toBe(true)
    })
    client.dispose()
  })

  it('closes an open document with didClose', async () => {
    const seenMethods: string[] = []
    const { proc, stdout } = createMockProc((msg) => {
      if (msg.method) seenMethods.push(msg.method)
      if (msg.method === 'initialize' && msg.id != null) {
        stdout.write(
          encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }),
        )
      }
    })
    spawnMock.mockReturnValue(proc)

    const client = new LspClient(serverDef, '/workspace')
    await client.start()
    client.syncDocument('/workspace/src/a.ts', 'const x = 1', 'typescript')
    client.closeDocument('/workspace/src/a.ts')
    client.syncDocument('/workspace/src/a.ts', 'const x = 2', 'typescript')

    expect(seenMethods.filter((m) => m === 'textDocument/didOpen')).toHaveLength(2)
    expect(seenMethods).toContain('textDocument/didClose')
    client.dispose()
  })

  it('returns empty diagnostics when disposed', async () => {
    const client = new LspClient(serverDef, '/workspace')
    client.dispose()
    await expect(
      client.getDiagnostics('/workspace/a.ts', 'x', 'typescript'),
    ).resolves.toEqual([])
  })
})
