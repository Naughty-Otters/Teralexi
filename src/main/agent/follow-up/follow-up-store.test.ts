import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/services/follow-up-notify', () => ({
  notifyConversationFollowUpsChanged: vi.fn(),
}))

import {
  clearFollowUpMeta,
  followUpMetaPath,
  readFollowUpMeta,
  writeFollowUpMeta,
} from './follow-up-store'
import {
  FOLLOWUP_META_REL_PATH,
  type FollowUpMeta,
} from '@shared/agent/follow-up'
import { notifyConversationFollowUpsChanged } from '@main/services/follow-up-notify'

describe('follow-up-store', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-fu-store-'))
    vi.mocked(notifyConversationFollowUpsChanged).mockClear()
  })

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('writes and reads meta under followup/meta.json', async () => {
    const meta: FollowUpMeta = {
      version: 1,
      conversationId: 'c1',
      updatedAt: new Date().toISOString(),
      followUps: [
        {
          id: 'a',
          label: 'Continue',
          action: { type: 'user_input', message: 'continue please' },
        },
      ],
    }
    expect(writeFollowUpMeta(sandboxRoot, meta)).toBe(
      followUpMetaPath(sandboxRoot),
    )
    const raw = await readFile(
      path.join(sandboxRoot, FOLLOWUP_META_REL_PATH),
      'utf8',
    )
    expect(JSON.parse(raw).followUps).toHaveLength(1)
    expect(readFollowUpMeta(sandboxRoot, 'c1').followUps[0]?.label).toBe(
      'Continue',
    )
    expect(notifyConversationFollowUpsChanged).toHaveBeenCalledWith(
      'c1',
      meta.followUps,
    )
  })

  it('clears meta by deleting the file and notifies empty list', async () => {
    await mkdir(path.join(sandboxRoot, 'followup'), { recursive: true })
    await writeFile(
      path.join(sandboxRoot, FOLLOWUP_META_REL_PATH),
      JSON.stringify({
        version: 1,
        conversationId: 'c1',
        updatedAt: new Date().toISOString(),
        followUps: [],
      }),
      'utf8',
    )
    expect(clearFollowUpMeta(sandboxRoot, 'c1')).toBe(true)
    expect(clearFollowUpMeta(sandboxRoot, 'c1')).toBe(true)
    expect(readFollowUpMeta(sandboxRoot, 'c1').followUps).toEqual([])
    expect(notifyConversationFollowUpsChanged).toHaveBeenCalledWith('c1', [])
  })
})
