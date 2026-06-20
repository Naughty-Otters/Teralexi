import { CLAWHUB_REGISTRY_BASE_URL } from '@shared/skills/clawhub-types'
import type {
  ClawHubSkillDetail,
  ClawHubSkillSearchResult,
} from '@shared/skills/clawhub-types'

export type ClawHubClientOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
}

function resolveBaseUrl(options?: ClawHubClientOptions): string {
  const fromEnv = process.env.CLAWHUB_REGISTRY?.trim()
  return options?.baseUrl ?? fromEnv ?? CLAWHUB_REGISTRY_BASE_URL
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export class ClawHubClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options?: ClawHubClientOptions) {
    this.baseUrl = resolveBaseUrl(options).replace(/\/+$/, '')
    this.fetchImpl = options?.fetchImpl ?? fetch
  }

  private async request(
    path: string,
    init?: RequestInit,
    retries = 2,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (response.status === 429 && retries > 0) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '2')
      await sleep(Math.max(1, retryAfter) * 1000)
      return this.request(path, init, retries - 1)
    }

    return response
  }

  private async readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        text.trim() || `ClawHub request failed (${response.status})`,
      )
    }
    return (await response.json()) as T
  }

  async searchSkills(args: {
    query: string
    limit?: number
    nonSuspiciousOnly?: boolean
  }): Promise<ClawHubSkillSearchResult> {
    const params = new URLSearchParams({
      q: args.query.trim(),
    })
    if (args.limit != null) params.set('limit', String(args.limit))
    if (args.nonSuspiciousOnly !== false) {
      params.set('nonSuspiciousOnly', 'true')
    }

    const response = await this.request(`/api/v1/search?${params.toString()}`)
    return this.readJson<ClawHubSkillSearchResult>(response)
  }

  async getSkill(slug: string): Promise<ClawHubSkillDetail> {
    const encoded = encodeURIComponent(slug)
    const response = await this.request(`/api/v1/skills/${encoded}`)
    const body = await this.readJson<{
      skill: {
        slug: string
        displayName: string
        summary?: string
        tags?: Record<string, string>
        stats?: Record<string, unknown>
      }
      latestVersion?: {
        version: string
        createdAt?: number
        changelog?: string
      }
      moderation?: ClawHubSkillDetail['moderation']
    }>(response)

    const latest = body.latestVersion
    if (!latest?.version) {
      throw new Error(`ClawHub skill "${slug}" has no published version`)
    }

    return {
      slug: body.skill.slug,
      displayName: body.skill.displayName,
      summary: body.skill.summary ?? '',
      latestVersion: {
        version: latest.version,
        ...(latest.createdAt != null ? { createdAt: latest.createdAt } : {}),
        ...(latest.changelog ? { changelog: latest.changelog } : {}),
      },
      ...(body.moderation ? { moderation: body.moderation } : {}),
      ...(body.skill.tags ? { tags: body.skill.tags } : {}),
      ...(body.skill.stats ? { stats: body.skill.stats } : {}),
    }
  }

  async downloadSkillZip(args: {
    slug: string
    version?: string
    tag?: string
  }): Promise<Buffer> {
    const params = new URLSearchParams({ slug: args.slug })
    if (args.version) params.set('version', args.version)
    if (args.tag) params.set('tag', args.tag)

    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/download?${params.toString()}`,
      { headers: { Accept: 'application/zip' } },
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        text.trim() || `ClawHub download failed (${response.status})`,
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

let clientSingleton: ClawHubClient | null = null

export function getClawHubClient(): ClawHubClient {
  if (!clientSingleton) {
    clientSingleton = new ClawHubClient()
  }
  return clientSingleton
}

export function resetClawHubClientForTests(): void {
  clientSingleton = null
}
