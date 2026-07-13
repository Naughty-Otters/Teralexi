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
  resetFollowUpCatalogGatesForTests,
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
    resetFollowUpCatalogGatesForTests()
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
    const written = writeFollowUpMeta(sandboxRoot, meta)
    expect(written.ok).toBe(true)
    if (!written.ok) return
    expect(written.path).toBe(followUpMetaPath(sandboxRoot))
    expect(written.revision).toBe(1)
    const raw = await readFile(
      path.join(sandboxRoot, FOLLOWUP_META_REL_PATH),
      'utf8',
    )
    expect(JSON.parse(raw).followUps).toHaveLength(1)
    expect(JSON.parse(raw).revision).toBe(1)
    expect(readFollowUpMeta(sandboxRoot, 'c1').followUps[0]?.label).toBe(
      'Continue',
    )
    expect(notifyConversationFollowUpsChanged).toHaveBeenCalledWith(
      'c1',
      meta.followUps,
      1,
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
    const first = clearFollowUpMeta(sandboxRoot, 'c1')
    expect(first.ok).toBe(true)
    expect(first.revision).toBe(1)
    const second = clearFollowUpMeta(sandboxRoot, 'c1')
    expect(second.ok).toBe(true)
    expect(second.revision).toBe(2)
    expect(readFollowUpMeta(sandboxRoot, 'c1').followUps).toEqual([])
    expect(notifyConversationFollowUpsChanged).toHaveBeenCalledWith('c1', [], 1)
  })

  it('rejects writes after UI clear until enableWrites', async () => {
    const meta: FollowUpMeta = {
      version: 1,
      conversationId: 'c-gate',
      updatedAt: new Date().toISOString(),
      followUps: [
        {
          id: 'a',
          label: 'One',
          action: { type: 'user_input', message: 'one' },
        },
      ],
    }
    expect(writeFollowUpMeta(sandboxRoot, meta).ok).toBe(true)
    clearFollowUpMeta(sandboxRoot, 'c-gate', { enableWrites: false })
    const blocked = writeFollowUpMeta(sandboxRoot, meta)
    expect(blocked).toEqual({ ok: false, reason: 'writes_disabled' })

    clearFollowUpMeta(sandboxRoot, 'c-gate', { enableWrites: true })
    const allowed = writeFollowUpMeta(sandboxRoot, meta)
    expect(allowed.ok).toBe(true)
    if (!allowed.ok) return
    expect(allowed.revision).toBeGreaterThan(2)
  })
})
