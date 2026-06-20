export type McpRegistryTransportType = 'http' | 'sse' | 'stdio'

export type McpRegistryEnvVarTemplate = {
  name: string
  description?: string
  isRequired?: boolean
  isSecret?: boolean
  default?: string
  placeholder?: string
}

export type McpRegistryHeaderTemplate = {
  name: string
  description?: string
  isRequired?: boolean
  isSecret?: boolean
  placeholder?: string
}

export type McpRegistryServerSummary = {
  name: string
  title?: string
  description?: string
  version: string
  transportTypes: McpRegistryTransportType[]
  repositoryUrl?: string
}

export type McpRegistryServerDraft = {
  name: string
  transportType: McpRegistryTransportType
  url: string
  command: string
  args: string[]
  envTemplate: McpRegistryEnvVarTemplate[]
  headersTemplate: McpRegistryHeaderTemplate[]
  source: 'package' | 'remote'
  registryName: string
  registryVersion: string
  description?: string
  repositoryUrl?: string
}

export type McpRegistrySearchResult = {
  servers: McpRegistryServerSummary[]
  nextCursor?: string
}
