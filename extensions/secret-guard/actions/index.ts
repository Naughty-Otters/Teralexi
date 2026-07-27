import type { HookHandler } from '@teralexi/skill-sdk'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

async function appendAuditLog(entry: unknown): Promise<void> {
  const dir = join(homedir(), '.teralexi')
  await mkdir(dir, { recursive: true })
  await appendFile(
    join(dir, 'audit.log'),
    `${JSON.stringify(entry)}\n`,
    'utf-8',
  )
}

export const hooks: Record<string, HookHandler> = {
  afterToolCall: async (ctx) => {
    await appendAuditLog({
      tool: ctx.toolName,
      conversationId: ctx.conversationId,
      at: new Date().toISOString(),
    })
    return { continue: true }
  },
}
