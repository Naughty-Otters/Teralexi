import { describe, expect, it } from 'vitest'
import { encodeMessage, MessageBuffer } from './json-rpc'

describe('encodeMessage', () => {
  it('frames with a byte-accurate Content-Length header', () => {
    const framed = encodeMessage({ jsonrpc: '2.0', id: 1, method: 'ping' }).toString('utf8')
    const [header, body] = framed.split('\r\n\r\n')
    expect(header).toMatch(/^Content-Length: \d+$/)
    const declared = Number(header.replace('Content-Length: ', ''))
    expect(Buffer.byteLength(body, 'utf8')).toBe(declared)
    expect(JSON.parse(body)).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' })
  })

  it('counts bytes (not chars) for multibyte content', () => {
    const framed = encodeMessage({ jsonrpc: '2.0', method: 'x', params: { s: '✓é' } }).toString('utf8')
    const [header, body] = framed.split('\r\n\r\n')
    const declared = Number(header.replace('Content-Length: ', ''))
    expect(Buffer.byteLength(body, 'utf8')).toBe(declared)
  })
})

describe('MessageBuffer', () => {
  it('parses a single complete message', () => {
    const buf = new MessageBuffer()
    const out = buf.push(encodeMessage({ jsonrpc: '2.0', id: 7, result: { ok: true } }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 7, result: { ok: true } })
  })

  it('reassembles a message split across chunks', () => {
    const buf = new MessageBuffer()
    const framed = encodeMessage({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics' })
    const mid = Math.floor(framed.length / 2)
    expect(buf.push(framed.subarray(0, mid))).toHaveLength(0)
    const out = buf.push(framed.subarray(mid))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ method: 'textDocument/publishDiagnostics' })
  })

  it('parses multiple messages from one chunk', () => {
    const buf = new MessageBuffer()
    const a = encodeMessage({ jsonrpc: '2.0', id: 1, result: 'a' })
    const b = encodeMessage({ jsonrpc: '2.0', id: 2, result: 'b' })
    const out = buf.push(Buffer.concat([a, b]))
    expect(out.map((m) => m.id)).toEqual([1, 2])
  })

  it('handles a header split mid-way between chunks', () => {
    const buf = new MessageBuffer()
    const framed = encodeMessage({ jsonrpc: '2.0', id: 9, result: null })
    // split inside the header
    expect(buf.push(framed.subarray(0, 5))).toHaveLength(0)
    const out = buf.push(framed.subarray(5))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 9 })
  })
})
