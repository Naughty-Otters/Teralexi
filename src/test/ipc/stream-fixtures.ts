export type AgentStreamPayload = {
  conversationId: string
  assistantId: string
}

export type AgentUiMessageChunkPayload = AgentStreamPayload & {
  chunk: Record<string, unknown>
}

export type AgentStringChunkPayload = AgentStreamPayload & {
  chunk: string
}

export function textDeltaChunk(
  base: AgentStreamPayload,
  delta: string,
  textPartId = 'text-main',
): AgentUiMessageChunkPayload {
  return {
    ...base,
    chunk: {
      type: 'text-delta',
      id: textPartId,
      delta,
    },
  }
}

export function textStartChunk(
  base: AgentStreamPayload,
  textPartId = 'text-main',
): AgentUiMessageChunkPayload {
  return {
    ...base,
    chunk: {
      type: 'text-start',
      id: textPartId,
    },
  }
}

export function textEndChunk(
  base: AgentStreamPayload,
  textPartId = 'text-main',
): AgentUiMessageChunkPayload {
  return {
    ...base,
    chunk: {
      type: 'text-end',
      id: textPartId,
    },
  }
}

export function toolApprovalRequestChunk(
  base: AgentStreamPayload,
  options: {
    approvalId?: string
    toolName?: string
  } = {},
): AgentUiMessageChunkPayload {
  const approvalId = options.approvalId ?? 'approval-1'
  const toolName = options.toolName ?? 'read_file'
  return {
    ...base,
    chunk: {
      type: 'tool-approval-request',
      approvalId,
      toolCallId: 'tool-call-1',
      toolName,
      input: { path: 'README.md' },
    },
  }
}

export function collectFormRequestChunk(
  base: AgentStreamPayload,
  options: {
    requestId?: string
    title?: string
    fields?: Array<{
      key: string
      label: string
      type: string
      required?: boolean
    }>
  } = {},
): AgentUiMessageChunkPayload {
  const requestId = options.requestId ?? 'collect-form-1'
  return {
    ...base,
    chunk: {
      type: 'data-collect-form-request',
      id: requestId,
      data: {
        title: options.title ?? 'Additional information required',
        message: 'Please provide the details below.',
        fields: options.fields ?? [
          {
            key: 'topic',
            label: 'Topic',
            type: 'text',
            required: true,
          },
        ],
      },
    },
  }
}

export function legacyStringChunk(
  base: AgentStreamPayload,
  chunk: string,
): AgentStringChunkPayload {
  return {
    ...base,
    chunk,
  }
}

export function streamFinishedPayload(
  base: AgentStreamPayload,
): AgentStreamPayload {
  return { ...base }
}
