import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV,
  TERALEXI_AGENT_CONVERSATION_ID_ENV,
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  ASSISTANT_MESSAGE_ID_GLOBAL_KEY,
  SANDBOX_ROOT_GLOBAL_KEY,
  CONVERSATION_ID_GLOBAL_KEY,
} from '@main/agent/sandbox'
import { FOLLOWUP_META_REL_PATH } from '@shared/agent/follow-up'
import { resetFollowUpCatalogGatesForTests } from '@main/agent/follow-up'
import { generateFollowUp } from './generate-follow-up'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setConversationId(id: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (id) {
    g[CONVERSATION_ID_GLOBAL_KEY] = id
    process.env[TERALEXI_AGENT_CONVERSATION_ID_ENV] = id
  } else {
    delete g[CONVERSATION_ID_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_CONVERSATION_ID_ENV]
  }
}

function setAssistantMessageId(id: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (id) {
    g[ASSISTANT_MESSAGE_ID_GLOBAL_KEY] = id
    process.env[TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV] = id
  } else {
    delete g[ASSISTANT_MESSAGE_ID_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_ASSISTANT_MESSAGE_ID_ENV]
  }
}

describe('generate_follow_up tool', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-followup-'))
    resetFollowUpCatalogGatesForTests()
    setSandboxRoot(sandboxRoot)
    setConversationId('conv-followup-1')
    setAssistantMessageId('asst-followup-1')
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setConversationId(undefined)
    setAssistantMessageId(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('writes followup/meta.json with a list of mixed actions', async () => {
    const result = (await generateFollowUp.execute({
      follow_ups: [
        {
          label: 'Ask the agent to write tests',
          action: {
            type: 'user_input',
            message: 'Please add unit tests for the new helper.',
          },
          priority: 1,
        },
        {
          id: 'grep-todos',
          label: 'Search for remaining TODOs',
          action: {
            type: 'tool_call',
            tool: 'grep_files',
            args: { pattern: 'TODO', path: 'src' },
          },
          priority: 0,
        },
      ],
      source_user_message: 'Ship the helper',
    })) as Record<string, unknown>

    expect(result.ok).toBe(true)
    expect(result.path).toBe(FOLLOWUP_META_REL_PATH)
    expect(result.count).toBe(2)

    const raw = await readFile(
      path.join(sandboxRoot, FOLLOWUP_META_REL_PATH),
      'utf8',
    )
    const meta = JSON.parse(raw) as {
      version: number
      conversationId: string
      followUps: Array<{ id: string; label: string; action: { type: string } }>
      source?: { userMessage?: string; assistantMessageId?: string }
    }
    expect(meta.version).toBe(1)
    expect(meta.conversationId).toBe('conv-followup-1')
    expect(meta.source?.userMessage).toBe('Ship the helper')
    expect(meta.source?.assistantMessageId).toBe('asst-followup-1')
    expect(meta.followUps).toHaveLength(2)
    expect(meta.followUps[0]?.id).toBe('grep-todos')
    expect(meta.followUps[0]?.action.type).toBe('tool_call')
    expect(meta.followUps[1]?.action.type).toBe('user_input')
  })

  it('appends additional follow-ups by id', async () => {
    await generateFollowUp.execute({
      follow_ups: [
        {
          id: 'a',
          label: 'First',
          action: { type: 'user_input', message: 'first' },
        },
      ],
    })
    const result = (await generateFollowUp.execute({
      mode: 'append',
      follow_ups: [
        {
          id: 'b',
          label: 'Second',
          action: { type: 'user_input', message: 'second' },
        },
      ],
    })) as { count: number }

    expect(result.count).toBe(2)
    const raw = await readFile(
      path.join(sandboxRoot, FOLLOWUP_META_REL_PATH),
      'utf8',
    )
    const meta = JSON.parse(raw) as { followUps: unknown[] }
    expect(meta.followUps).toHaveLength(2)
  })

  it('errors without conversation id', async () => {
    setConversationId(undefined)
    const result = (await generateFollowUp.execute({
      follow_ups: [
        {
          label: 'X',
          action: { type: 'user_input', message: 'x' },
        },
      ],
    })) as { error?: string }
    expect(result.error).toMatch(/conversation id/i)
  })
})
