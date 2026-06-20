import type { WorkflowMocks } from '@shared/workflows/schema'
import type { WorkflowRunMode } from '@shared/workflows/deployment-target'
import { isReadOnlyTool } from './workflow-validator'

export type HttpMockRequest = {
  method: string
  url: string
  body?: unknown
}

export type ToolMockRequest = {
  toolName: string
  input: Record<string, unknown>
}

export type MockHit = {
  kind: 'http' | 'tool'
  match: string
}

export type MockMiss = {
  kind: 'http' | 'tool'
  request: string
}

export class MockRegistry {
  private readonly httpMocks: NonNullable<WorkflowMocks['http']>
  private readonly toolMocks: NonNullable<WorkflowMocks['tools']>
  readonly hits: MockHit[] = []
  readonly misses: MockMiss[] = []

  constructor(
    mocks: WorkflowMocks | undefined,
    private readonly runMode: WorkflowRunMode,
  ) {
    this.httpMocks = mocks?.http ?? []
    this.toolMocks = mocks?.tools ?? []
  }

  shouldUseMocks(): boolean {
    return this.runMode === 'test'
  }

  matchHttp(request: HttpMockRequest): unknown | null {
    if (!this.shouldUseMocks()) return null

    for (const mock of this.httpMocks) {
      const [mockMethod, mockUrl] = mock.match.split(/\s+/, 2)
      const method = (mock.method ?? mockMethod ?? 'GET').toUpperCase()
      const url = mockUrl ?? mock.match
      if (
        request.method.toUpperCase() === method.toUpperCase() &&
        request.url.includes(url.replace(/^\w+\s+/, ''))
      ) {
        this.hits.push({ kind: 'http', match: mock.match })
        return mock.response.body ?? mock.response
      }
    }

    this.misses.push({
      kind: 'http',
      request: `${request.method} ${request.url}`,
    })
    return null
  }

  matchTool(request: ToolMockRequest): unknown | null {
    if (!this.shouldUseMocks()) return null

    for (const mock of this.toolMocks) {
      if (mock.tool !== request.toolName) continue
      if (mock.inputMatch) {
        const matches = Object.entries(mock.inputMatch).every(
          ([key, value]) => request.input[key] === value,
        )
        if (!matches) continue
      }
      this.hits.push({ kind: 'tool', match: mock.tool })
      return mock.fixture ?? { ok: true, mocked: true }
    }

    if (!isReadOnlyTool(request.toolName)) {
      this.misses.push({
        kind: 'tool',
        request: request.toolName,
      })
      throw new Error(
        `No mock registered for tool "${request.toolName}" in test mode`,
      )
    }

    return null
  }

  wrapToolExecute<T>(
    toolName: string,
    input: Record<string, unknown>,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (!this.shouldUseMocks()) {
      return execute()
    }
    const mocked = this.matchTool({ toolName, input })
    if (mocked !== null) {
      return Promise.resolve(mocked as T)
    }
    return execute()
  }
}

export function createMockRegistry(
  mocks: WorkflowMocks | undefined,
  runMode: WorkflowRunMode,
): MockRegistry {
  return new MockRegistry(mocks, runMode)
}
