import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { z } from 'zod'
import type { SkillTool } from '@teralexi/skill-sdk'
import {
  getValidAccessToken,
  loadStoredAccount,
  requireActiveSandbox,
  resolveSandboxRelativePath,
} from '@teralexi/skill-sdk'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'

export type GoogleWorkspaceApiResult = {
  success: boolean
  statusCode: number
  data?: unknown
  endpoint: string
  method: string
  error?: string
}

function formatAuthHint(error?: string): string {
  const base =
    'Ask the user to sign in via Settings → General → Google Workspace. If they already signed in before Workspace was enabled, sign out and sign in again.'
  return error ? `${error} ${base}` : base
}

export async function googleWorkspaceRequest(options: {
  method?: string
  url: string
  body?: unknown
  headers?: Record<string, string>
}): Promise<GoogleWorkspaceApiResult> {
  const method = (options.method ?? 'GET').toUpperCase()
  const endpoint = options.url

  let accessToken: string
  try {
    accessToken = await getValidAccessToken()
  } catch (err) {
    return {
      success: false,
      statusCode: 401,
      endpoint,
      method,
      error: formatAuthHint(err instanceof Error ? err.message : String(err)),
    }
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...options.headers,
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(options.url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    const text = await res.text()
    let data: unknown = text
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (!res.ok) {
      const apiMessage =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error?: { message?: string } }).error?.message === 'string'
          ? (data as { error: { message: string } }).error.message
          : res.statusText
      const scopeHint =
        res.status === 403
          ? ' Insufficient OAuth scopes — sign out and sign in again in Settings → Google Account.'
          : ''
      return {
        success: false,
        statusCode: res.status,
        data,
        endpoint,
        method,
        error: `${apiMessage}${scopeHint}`,
      }
    }

    return {
      success: true,
      statusCode: res.status,
      data,
      endpoint,
      method,
    }
  } catch (err) {
    return {
      success: false,
      statusCode: 0,
      endpoint,
      method,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function encodeGmailRaw(message: string): string {
  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function buildMimeMessage(input: {
  to: string
  subject: string
  body: string
  from?: string
}): string {
  const fromLine = input.from?.trim() ? `From: ${input.from.trim()}\r\n` : ''
  return `${fromLine}To: ${input.to.trim()}\r\nSubject: ${input.subject.trim()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`
}

type GoogleWorkspaceApprovalFn<T> = (input: T) => boolean | Promise<boolean>

function defineGoogleWorkspaceTool<T extends z.ZodTypeAny>(config: {
  name: string
  description: string
  inputSchema: T
  needsApproval?: boolean | GoogleWorkspaceApprovalFn<z.infer<T>>
  execute: (input: z.infer<T>) => Promise<GoogleWorkspaceApiResult | Record<string, unknown>>
}): SkillTool {
  const tool: SkillTool = {
    name: config.name,
    tags: ['google-workspace', 'skill:google-workspace'],
    description: config.description,
    inputSchema: config.inputSchema,
    needsApproval: false,
    async execute(input) {
      const parsed = config.inputSchema.safeParse(input)
      if (!parsed.success) {
        return { success: false, error: parsed.error.flatten() }
      }
      return config.execute(parsed.data)
    },
  }

  if (typeof config.needsApproval === 'function') {
    ;(tool as SkillTool & { needsApproval: GoogleWorkspaceApprovalFn<z.infer<T>> }).needsApproval =
      config.needsApproval as never
  } else {
    tool.needsApproval = config.needsApproval ?? false
  }

  return tool
}

export const googleWorkspaceAuthStatus = defineGoogleWorkspaceTool({
  name: 'google_workspace_auth_status',
  description:
    'Check Google sign-in for Workspace tools (Gmail, Calendar, Drive). Read-only. Run first if other google_* tools fail.',
  inputSchema: z.object({}),
  async execute() {
    const account = loadStoredAccount()
    if (!account) {
      return {
        success: false,
        error: formatAuthHint('Not signed in with Google.'),
      }
    }
    const scopes = account.tokens.scope?.split(/\s+/).filter(Boolean) ?? []
    return {
      success: true,
      email: account.userInfo.email,
      name: account.userInfo.name,
      scopes,
      expiresAt: account.tokens.expires_at,
    }
  },
})

export const googleGmailListMessages = defineGoogleWorkspaceTool({
  name: 'google_gmail_list_messages',
  description: 'List Gmail message ids matching a search query (Gmail search syntax). Read-only.',
  inputSchema: z.object({
    query: z.string().optional().describe('Gmail search query (e.g. is:unread from:alice).'),
    maxResults: z.number().int().min(1).max(100).optional().default(20),
    labelIds: z
      .array(z.string())
      .optional()
      .describe('Filter by label ids (e.g. INBOX, UNREAD).'),
  }),
  async execute(input) {
    const params = new URLSearchParams()
    params.set('maxResults', String(input.maxResults))
    if (input.query?.trim()) params.set('q', input.query.trim())
    if (input.labelIds?.length) {
      for (const id of input.labelIds) params.append('labelIds', id)
    }
    return googleWorkspaceRequest({
      url: `${GMAIL_BASE}/messages?${params.toString()}`,
    })
  },
})

export const googleGmailGetMessage = defineGoogleWorkspaceTool({
  name: 'google_gmail_get_message',
  description: 'Get a Gmail message by id (headers and snippet; use format=full for body). Read-only.',
  inputSchema: z.object({
    messageId: z.string().min(1),
    format: z
      .enum(['minimal', 'full', 'raw', 'metadata'])
      .optional()
      .default('metadata')
      .describe('Gmail API format parameter.'),
  }),
  async execute(input) {
    const params = new URLSearchParams({ format: input.format })
    return googleWorkspaceRequest({
      url: `${GMAIL_BASE}/messages/${encodeURIComponent(input.messageId)}?${params.toString()}`,
    })
  },
})

export const googleGmailSend = defineGoogleWorkspaceTool({
  name: 'google_gmail_send',
  description: 'Send a plain-text email via Gmail API. Requires approval.',
  inputSchema: z.object({
    to: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    from: z.string().optional().describe('Optional From header (defaults to signed-in account).'),
  }),
  needsApproval: true,
  async execute(input) {
    const raw = encodeGmailRaw(buildMimeMessage(input))
    return googleWorkspaceRequest({
      method: 'POST',
      url: `${GMAIL_BASE}/messages/send`,
      body: { raw },
    })
  },
})

export const googleCalendarListCalendars = defineGoogleWorkspaceTool({
  name: 'google_calendar_list_calendars',
  description: 'List calendars on the signed-in Google account. Read-only.',
  inputSchema: z.object({
    maxResults: z.number().int().min(1).max(250).optional().default(50),
  }),
  async execute(input) {
    const params = new URLSearchParams({ maxResults: String(input.maxResults) })
    return googleWorkspaceRequest({
      url: `${CALENDAR_BASE}/users/me/calendarList?${params.toString()}`,
    })
  },
})

export const googleCalendarListEvents = defineGoogleWorkspaceTool({
  name: 'google_calendar_list_events',
  description: 'List events on a calendar within a time range. Read-only.',
  inputSchema: z.object({
    calendarId: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar id (default: primary).'),
    timeMin: z.string().optional().describe('RFC3339 lower bound (inclusive).'),
    timeMax: z.string().optional().describe('RFC3339 upper bound (exclusive).'),
    maxResults: z.number().int().min(1).max(250).optional().default(25),
    q: z.string().optional().describe('Free-text search query.'),
  }),
  async execute(input) {
    const params = new URLSearchParams({
      maxResults: String(input.maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
    })
    if (input.timeMin?.trim()) params.set('timeMin', input.timeMin.trim())
    if (input.timeMax?.trim()) params.set('timeMax', input.timeMax.trim())
    if (input.q?.trim()) params.set('q', input.q.trim())
    const calendarId = encodeURIComponent(input.calendarId ?? 'primary')
    return googleWorkspaceRequest({
      url: `${CALENDAR_BASE}/calendars/${calendarId}/events?${params.toString()}`,
    })
  },
})

export const googleCalendarCreateEvent = defineGoogleWorkspaceTool({
  name: 'google_calendar_create_event',
  description: 'Create a calendar event. Requires approval.',
  inputSchema: z.object({
    calendarId: z.string().optional().default('primary'),
    summary: z.string().min(1),
    description: z.string().optional(),
    start: z.string().min(1).describe('RFC3339 start datetime.'),
    end: z.string().min(1).describe('RFC3339 end datetime.'),
    timeZone: z.string().optional().describe('IANA time zone (e.g. America/Los_Angeles).'),
    attendees: z.array(z.string().email()).optional(),
  }),
  needsApproval: true,
  async execute(input) {
    const body: Record<string, unknown> = {
      summary: input.summary,
      start: input.timeZone
        ? { dateTime: input.start, timeZone: input.timeZone }
        : { dateTime: input.start },
      end: input.timeZone
        ? { dateTime: input.end, timeZone: input.timeZone }
        : { dateTime: input.end },
    }
    if (input.description?.trim()) body.description = input.description.trim()
    if (input.attendees?.length) {
      body.attendees = input.attendees.map((email) => ({ email }))
    }
    const calendarId = encodeURIComponent(input.calendarId ?? 'primary')
    return googleWorkspaceRequest({
      method: 'POST',
      url: `${CALENDAR_BASE}/calendars/${calendarId}/events`,
      body,
    })
  },
})

export const googleDriveListFiles = defineGoogleWorkspaceTool({
  name: 'google_drive_list_files',
  description: 'List or search Google Drive files. Read-only.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Drive query (e.g. name contains "report" and mimeType = "application/pdf").'),
    pageSize: z.number().int().min(1).max(100).optional().default(20),
    fields: z
      .string()
      .optional()
      .default('files(id,name,mimeType,modifiedTime,webViewLink,parents)'),
  }),
  async execute(input) {
    const params = new URLSearchParams({
      pageSize: String(input.pageSize),
      fields: `nextPageToken,${input.fields ?? 'files(id,name,mimeType,modifiedTime,webViewLink,parents)'}`,
    })
    if (input.query?.trim()) params.set('q', input.query.trim())
    return googleWorkspaceRequest({
      url: `${DRIVE_BASE}/files?${params.toString()}`,
    })
  },
})

export const googleDriveGetFile = defineGoogleWorkspaceTool({
  name: 'google_drive_get_file',
  description: 'Get Google Drive file metadata by id. Read-only.',
  inputSchema: z.object({
    fileId: z.string().min(1),
    fields: z.string().optional().default('id,name,mimeType,size,modifiedTime,webViewLink,parents'),
  }),
  async execute(input) {
    const params = new URLSearchParams({ fields: input.fields ?? 'id,name,mimeType,size,modifiedTime,webViewLink,parents' })
    return googleWorkspaceRequest({
      url: `${DRIVE_BASE}/files/${encodeURIComponent(input.fileId)}?${params.toString()}`,
    })
  },
})

export const googleDriveDownload = defineGoogleWorkspaceTool({
  name: 'google_drive_download',
  description:
    'Download a Drive file into the agent sandbox (export Google Docs/Sheets or download binary). Requires approval.',
  inputSchema: z.object({
    fileId: z.string().min(1),
    destination: z
      .string()
      .min(1)
      .describe('Sandbox-relative path to write the file (e.g. output/toolLoop/step/results/doc.pdf).'),
    exportMimeType: z
      .string()
      .optional()
      .describe(
        'Export mime type for Google Workspace files (e.g. application/pdf, text/plain). Omit for native download.',
      ),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) {
      return { success: false, error: sandbox.message }
    }

    let destAbs: string
    try {
      destAbs = resolveSandboxRelativePath(sandbox.root, input.destination)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    let accessToken: string
    try {
      accessToken = await getValidAccessToken()
    } catch (err) {
      return {
        success: false,
        error: formatAuthHint(err instanceof Error ? err.message : String(err)),
      }
    }

    const fileId = encodeURIComponent(input.fileId)
    const url = input.exportMimeType?.trim()
      ? `${DRIVE_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(input.exportMimeType.trim())}`
      : `${DRIVE_BASE}/files/${fileId}?alt=media`

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const text = await res.text()
        return {
          success: false,
          statusCode: res.status,
          endpoint: url,
          method: 'GET',
          error: text || res.statusText,
        }
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      mkdirSync(dirname(destAbs), { recursive: true })
      writeFileSync(destAbs, buffer)
      return {
        success: true,
        path: input.destination,
        bytesWritten: buffer.length,
        endpoint: url,
        method: 'GET',
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
})

export const googleWorkspaceApi = defineGoogleWorkspaceTool({
  name: 'google_workspace_api',
  description:
    'Call a Google Workspace REST API (Gmail, Calendar, Drive, etc.) with the signed-in account. Mutating methods require approval. Prefer dedicated google_* tools when available.',
  inputSchema: z.object({
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).optional().default('GET'),
    url: z
      .string()
      .min(1)
      .describe('Full HTTPS URL on googleapis.com (must start with https://).'),
    body: z.record(z.string(), z.unknown()).optional().describe('JSON body for POST/PATCH/PUT.'),
  }),
  needsApproval: (input) => input.method !== 'GET',
  async execute(input) {
    const url = input.url.trim()
    if (!url.startsWith('https://') || !url.includes('googleapis.com')) {
      return {
        success: false,
        error: 'url must be an https://…googleapis.com endpoint.',
      }
    }
    return googleWorkspaceRequest({
      method: input.method,
      url,
      body: input.body,
    })
  },
})

export const googleWorkspaceTools: SkillTool[] = [
  googleWorkspaceAuthStatus,
  googleGmailListMessages,
  googleGmailGetMessage,
  googleGmailSend,
  googleCalendarListCalendars,
  googleCalendarListEvents,
  googleCalendarCreateEvent,
  googleDriveListFiles,
  googleDriveGetFile,
  googleDriveDownload,
  googleWorkspaceApi,
]
