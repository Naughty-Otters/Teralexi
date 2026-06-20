import type {
  McpRegistryEnvVarTemplate,
  McpRegistryHeaderTemplate,
  McpRegistryServerDraft,
  McpRegistryServerSummary,
  McpRegistryTransportType,
} from './registry-types'

type RegistryArgument = {
  type?: string
  value?: string
  valueHint?: string
}

type RegistryPackage = {
  registryType?: string
  identifier?: string
  version?: string
  runtimeHint?: string
  runtimeArguments?: RegistryArgument[]
  transport?: { type?: string; url?: string }
  environmentVariables?: McpRegistryEnvVarTemplate[]
}

type RegistryRemote = {
  type?: string
  url?: string
  headers?: McpRegistryHeaderTemplate[]
}

type RegistryServerJson = {
  name?: string
  title?: string
  description?: string
  version?: string
  repository?: { url?: string }
  packages?: RegistryPackage[]
  remotes?: RegistryRemote[]
}

type RegistryServerEntry = {
  server?: RegistryServerJson
  _meta?: Record<string, { isLatest?: boolean } | unknown>
}

export function mapRegistryTransportType(
  raw?: string,
): McpRegistryTransportType | null {
  if (!raw) return null
  if (raw === 'stdio') return 'stdio'
  if (raw === 'sse') return 'sse'
  if (raw === 'http' || raw === 'streamable-http') return 'http'
  return null
}

function collectTransportTypes(server: RegistryServerJson): McpRegistryTransportType[] {
  const types = new Set<McpRegistryTransportType>()

  for (const pkg of server.packages ?? []) {
    const mapped = mapRegistryTransportType(pkg.transport?.type)
    if (mapped) types.add(mapped)
  }

  for (const remote of server.remotes ?? []) {
    const mapped = mapRegistryTransportType(remote.type)
    if (mapped) types.add(mapped)
  }

  return [...types]
}

function isLatestRegistryEntry(entry: RegistryServerEntry): boolean {
  const meta = entry._meta?.['io.modelcontextprotocol.registry/official']
  if (!meta || typeof meta !== 'object') return false
  return (meta as { isLatest?: boolean }).isLatest === true
}

export function dedupeRegistryEntries(
  entries: RegistryServerEntry[],
): RegistryServerEntry[] {
  const byName = new Map<string, RegistryServerEntry>()

  for (const entry of entries) {
    const name = entry.server?.name?.trim()
    if (!name) continue

    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, entry)
      continue
    }

    const entryIsLatest = isLatestRegistryEntry(entry)
    const existingIsLatest = isLatestRegistryEntry(existing)
    if (entryIsLatest && !existingIsLatest) {
      byName.set(name, entry)
      continue
    }

    const entryVersion = entry.server?.version ?? ''
    const existingVersion = existing.server?.version ?? ''
    if (!existingIsLatest && entryVersion > existingVersion) {
      byName.set(name, entry)
    }
  }

  return [...byName.values()]
}

export function toRegistryServerSummary(
  entry: RegistryServerEntry,
): McpRegistryServerSummary | null {
  const server = entry.server
  if (!server?.name?.trim()) return null

  return {
    name: server.name.trim(),
    title: server.title?.trim() || undefined,
    description: server.description?.trim() || undefined,
    version: server.version?.trim() || 'latest',
    transportTypes: collectTransportTypes(server),
    repositoryUrl: server.repository?.url?.trim() || undefined,
  }
}

function buildArgsFromPackage(pkg: RegistryPackage): string[] {
  const args: string[] = []

  for (const arg of pkg.runtimeArguments ?? []) {
    const value = arg.value?.trim()
    if (value) args.push(value)
  }

  const identifier = pkg.identifier?.trim()
  if (identifier) {
    const version = pkg.version?.trim()
    args.push(version ? `${identifier}@${version}` : identifier)
  }

  return args
}

function draftFromPackage(
  server: RegistryServerJson,
  pkg: RegistryPackage,
): McpRegistryServerDraft | null {
  const transportType = mapRegistryTransportType(pkg.transport?.type)
  if (!transportType) return null

  const registryName = server.name?.trim() ?? ''
  const registryVersion = server.version?.trim() || pkg.version?.trim() || 'latest'
  const displayName = server.title?.trim() || registryName

  if (transportType === 'stdio') {
    const command = pkg.runtimeHint?.trim() || 'npx'
    return {
      name: displayName,
      transportType,
      url: '',
      command,
      args: buildArgsFromPackage(pkg),
      envTemplate: (pkg.environmentVariables ?? []).map((item) => ({
        name: item.name,
        description: item.description,
        isRequired: item.isRequired,
        isSecret: item.isSecret,
        default: item.default,
        placeholder: item.placeholder,
      })),
      headersTemplate: [],
      source: 'package',
      registryName,
      registryVersion,
      description: server.description?.trim() || undefined,
      repositoryUrl: server.repository?.url?.trim() || undefined,
    }
  }

  const url = pkg.transport?.url?.trim()
  if (!url) return null

  return {
    name: displayName,
    transportType,
    url,
    command: '',
    args: [],
    envTemplate: (pkg.environmentVariables ?? []).map((item) => ({
      name: item.name,
      description: item.description,
      isRequired: item.isRequired,
      isSecret: item.isSecret,
      default: item.default,
      placeholder: item.placeholder,
    })),
    headersTemplate: [],
    source: 'package',
    registryName,
    registryVersion,
    description: server.description?.trim() || undefined,
    repositoryUrl: server.repository?.url?.trim() || undefined,
  }
}

function draftFromRemote(
  server: RegistryServerJson,
  remote: RegistryRemote,
): McpRegistryServerDraft | null {
  const transportType = mapRegistryTransportType(remote.type)
  const url = remote.url?.trim()
  if (!transportType || !url) return null

  const registryName = server.name?.trim() ?? ''
  const registryVersion = server.version?.trim() || 'latest'
  const displayName = server.title?.trim() || registryName

  return {
    name: displayName,
    transportType,
    url,
    command: '',
    args: [],
    envTemplate: [],
    headersTemplate: (remote.headers ?? []).map((item) => ({
      name: item.name,
      description: item.description,
      isRequired: item.isRequired,
      isSecret: item.isSecret,
      placeholder: item.placeholder,
    })),
    source: 'remote',
    registryName,
    registryVersion,
    description: server.description?.trim() || undefined,
    repositoryUrl: server.repository?.url?.trim() || undefined,
  }
}

export function listRegistryServerDrafts(
  entry: RegistryServerEntry,
): McpRegistryServerDraft[] {
  const server = entry.server
  if (!server) return []

  const drafts: McpRegistryServerDraft[] = []

  for (const pkg of server.packages ?? []) {
    const draft = draftFromPackage(server, pkg)
    if (draft) drafts.push(draft)
  }

  for (const remote of server.remotes ?? []) {
    const draft = draftFromRemote(server, remote)
    if (draft) drafts.push(draft)
  }

  return drafts
}

export function pickPreferredRegistryDraft(
  drafts: McpRegistryServerDraft[],
  preferredTransport?: McpRegistryTransportType,
): McpRegistryServerDraft | null {
  if (drafts.length === 0) return null
  if (preferredTransport) {
    const match = drafts.find((draft) => draft.transportType === preferredTransport)
    if (match) return match
  }

  const stdio = drafts.find((draft) => draft.transportType === 'stdio')
  if (stdio) return stdio

  const http = drafts.find((draft) => draft.transportType === 'http')
  if (http) return http

  return drafts[0] ?? null
}

export function registryDraftToKvLines(
  templates: Array<McpRegistryEnvVarTemplate | McpRegistryHeaderTemplate>,
  values: Record<string, string>,
): string {
  return templates
    .map((template) => {
      const value = values[template.name] ?? template.default ?? ''
      return value ? `${template.name}: ${value}` : ''
    })
    .filter(Boolean)
    .join('\n')
}
