import type { JsonRpcMessage } from './types'

/**
 * LSP base protocol framing: `Content-Length: N\r\n\r\n<json>`.
 *
 * These helpers are pure and stream-agnostic so they can be unit-tested without
 * spawning a real language server.
 */

const HEADER_SEPARATOR = '\r\n\r\n'

/** Encode a JSON-RPC message into a framed Buffer ready to write to stdin. */
export function encodeMessage(message: JsonRpcMessage): Buffer {
  const json = JSON.stringify(message)
  const body = Buffer.from(json, 'utf8')
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii')
  return Buffer.concat([header, body])
}

/**
 * Incremental decoder. Feed it stdout chunks; it returns any complete messages
 * parsed so far and retains partial bytes for the next call.
 */
export class MessageBuffer {
  private buffer = Buffer.alloc(0)

  /** Append a chunk and return all newly-complete messages. */
  push(chunk: Buffer): JsonRpcMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: JsonRpcMessage[] = []

    for (;;) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR)
      if (headerEnd === -1) break

      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // Malformed header — drop everything up to and including the separator.
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEPARATOR.length)
        continue
      }

      const contentLength = Number(match[1])
      const bodyStart = headerEnd + HEADER_SEPARATOR.length
      const bodyEnd = bodyStart + contentLength
      if (this.buffer.length < bodyEnd) break // wait for more bytes

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8')
      this.buffer = this.buffer.subarray(bodyEnd)

      try {
        messages.push(JSON.parse(body) as JsonRpcMessage)
      } catch {
        // Skip unparseable body; protocol resyncs on the next header.
      }
    }

    return messages
  }
}
