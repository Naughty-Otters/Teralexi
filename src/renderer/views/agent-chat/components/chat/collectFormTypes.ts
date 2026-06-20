/** AI SDK data part from main-process CollectFormDataStep */
export type CollectFormRequestPart = {
  type: 'data-collect-form-request'
  id?: string
  data?: {
    todoId?: number
    todoName?: string
    formDocName?: string
    title?: string
    message?: string
    fields?: Array<{
      key: string
      label: string
      type: string
      required?: boolean
      placeholder?: string
      options?: Array<{ value: string; label: string }>
    }>
    markdownPreview?: string
  }
}

export function isCollectFormRequestPart(
  part: unknown,
): part is CollectFormRequestPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: string }).type === 'data-collect-form-request'
  )
}

export function asCollectFormPart(part: unknown): CollectFormRequestPart {
  return part as CollectFormRequestPart
}

export function collectFormPartData(part: unknown) {
  return asCollectFormPart(part).data
}

export function collectFormRequestId(part: unknown): string | undefined {
  return asCollectFormPart(part).id?.trim()
}
