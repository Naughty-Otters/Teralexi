import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../../../toolSet/sandbox-paths'

const fetchMock = vi.hoisted(() => vi.fn())
const getValidAccessTokenMock = vi.hoisted(() => vi.fn())
const loadStoredAccountMock = vi.hoisted(() => vi.fn())

vi.mock('@teralexi/skill-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@teralexi/skill-sdk')>()
  return {
    ...actual,
    getValidAccessToken: getValidAccessTokenMock,
    loadStoredAccount: loadStoredAccountMock,
  }
})

import {
  googleCalendarCreateEvent,
  googleCalendarListCalendars,
  googleCalendarListEvents,
  googleDriveDownload,
  googleDriveGetFile,
  googleDriveListFiles,
  googleGmailGetMessage,
  googleGmailListMessages,
  googleGmailSend,
  googleWorkspaceApi,
  googleWorkspaceAuthStatus,
  googleWorkspaceRequest,
  googleWorkspaceTools,
} from './google-workspace'

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

function mockFetchJson(data: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? 'Forbidden' : 'OK',
    text: async () => JSON.stringify(data),
  })
}

describe('googleWorkspaceRequest', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getValidAccessTokenMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    getValidAccessTokenMock.mockResolvedValue('test-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns auth hint when not signed in', async () => {
    getValidAccessTokenMock.mockRejectedValue(new Error('Not signed in with Google.'))
    const result = await googleWorkspaceRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    })
    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(401)
    expect(result.error).toContain('Settings')
  })

  it('calls fetch with bearer token', async () => {
    mockFetchJson({ messages: [] })
    const result = await googleWorkspaceRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    })
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  it('handles API error with scope hint on 403', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => JSON.stringify({ error: { message: 'Insufficient Permission' } }),
    })
    const result = await googleWorkspaceRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    })
    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(403)
    expect(result.error).toContain('Insufficient Permission')
    expect(result.error).toContain('OAuth scopes')
  })

  it('handles non-json response bodies', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'plain-text',
    })
    const result = await googleWorkspaceRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    })
    expect(result.success).toBe(true)
    expect(result.data).toBe('plain-text')
  })

  it('POST sends JSON body', async () => {
    mockFetchJson({ id: '1' })
    await googleWorkspaceRequest({
      method: 'POST',
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      body: { raw: 'abc' },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ raw: 'abc' }),
      }),
    )
  })

  it('surfaces network errors', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await googleWorkspaceRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('network down')
  })
})

describe('google_workspace_auth_status', () => {
  it('reports signed-in account', async () => {
    loadStoredAccountMock.mockReturnValue({
      tokens: { scope: 'openid email profile', expires_at: Date.now() + 3600_000 },
      userInfo: { email: 'a@example.com', name: 'Alice', sub: '1', picture: '' },
    })
    const result = await googleWorkspaceAuthStatus.execute({})
    expect(result).toMatchObject({
      success: true,
      email: 'a@example.com',
      name: 'Alice',
    })
  })

  it('reports not signed in', async () => {
    loadStoredAccountMock.mockReturnValue(null)
    const result = await googleWorkspaceAuthStatus.execute({})
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })
})

const googleToolInputs: Record<string, Record<string, unknown>> = {
  google_gmail_list_messages: { query: 'is:unread', maxResults: 5, labelIds: ['INBOX'] },
  google_gmail_get_message: { messageId: 'm1', format: 'full' },
  google_gmail_send: { to: 'b@example.com', subject: 'Hi', body: 'Hello' },
  google_calendar_list_calendars: { maxResults: 10 },
  google_calendar_list_events: {
    calendarId: 'primary',
    timeMin: '2020-01-01T00:00:00Z',
    timeMax: '2020-02-01T00:00:00Z',
    q: 'standup',
  },
  google_calendar_create_event: {
    summary: 'Meet',
    start: '2020-01-01T10:00:00Z',
    end: '2020-01-01T11:00:00Z',
    timeZone: 'UTC',
    attendees: ['guest@example.com'],
    description: 'Notes',
  },
  google_drive_list_files: { query: "name contains 'doc'", pageSize: 5 },
  google_drive_get_file: { fileId: 'file-1' },
  google_workspace_api: {
    method: 'GET',
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
  },
}

describe('google workspace tools', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getValidAccessTokenMock.mockReset()
    loadStoredAccountMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    getValidAccessTokenMock.mockResolvedValue('test-token')
    mockFetchJson({ ok: true })
    setSandboxRoot(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setSandboxRoot(undefined)
  })

  it('exports every google workspace tool', () => {
    expect(googleWorkspaceTools).toHaveLength(11)
  })

  for (const tool of googleWorkspaceTools) {
    if (tool.name === 'google_workspace_auth_status' || tool.name === 'google_drive_download') {
      continue
    }
    it(`${tool.name} executes via googleWorkspaceRequest`, async () => {
      fetchMock.mockClear()
      mockFetchJson({})
      await tool.execute(googleToolInputs[tool.name] ?? {})
      expect(fetchMock).toHaveBeenCalled()
    })
  }

  it('google_gmail_list_messages builds list URL with query', async () => {
    mockFetchJson({ messages: [] })
    await googleGmailListMessages.execute({ query: 'is:unread', maxResults: 5 })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/messages?')
    expect(url).toContain('q=is%3Aunread')
    expect(url).toContain('maxResults=5')
  })

  it('google_gmail_send requires approval', () => {
    expect(googleGmailSend.needsApproval).toBe(true)
  })

  it('google_workspace_api rejects non-google URLs', async () => {
    const result = await googleWorkspaceApi.execute({
      method: 'GET',
      url: 'https://example.com/api',
    })
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('googleapis.com'),
    })
  })

  it('google_workspace_api POST requires approval', () => {
    const fn = googleWorkspaceApi.needsApproval as (input: {
      method?: string
    }) => boolean
    expect(fn({ method: 'GET' })).toBe(false)
    expect(fn({ method: 'POST' })).toBe(true)
  })
})

describe('google_drive_download', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-gws-download-'))
    setSandboxRoot(sandboxRoot)
    fetchMock.mockReset()
    getValidAccessTokenMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    getValidAccessTokenMock.mockResolvedValue('test-token')
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('downloads file bytes into sandbox', async () => {
    const payload = Buffer.from('file-bytes')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => payload,
    })
    const dest = 'output/toolLoop/step/results/doc.bin'
    const result = await googleDriveDownload.execute({
      fileId: 'abc',
      destination: dest,
    })
    expect(result).toMatchObject({
      success: true,
      path: dest,
      bytesWritten: payload.length,
    })
    const written = readFileSync(path.join(sandboxRoot, dest), 'utf8')
    expect(written).toBe('file-bytes')
  })

  it('uses export endpoint when exportMimeType set', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => Buffer.from('pdf'),
    })
    await googleDriveDownload.execute({
      fileId: 'doc-id',
      destination: 'out.pdf',
      exportMimeType: 'application/pdf',
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/export?')
  })

  it('requires sandbox', async () => {
    setSandboxRoot(undefined)
    const result = await googleDriveDownload.execute({
      fileId: 'abc',
      destination: 'out.bin',
    })
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })

  it('returns validation error for invalid input', async () => {
    const result = await googleDriveDownload.execute({ fileId: '', destination: '' })
    expect(result).toMatchObject({ success: false, error: expect.any(Object) })
  })
})
