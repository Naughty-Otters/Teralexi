export type StepOutputLinkPreviewKind = 'image' | 'html' | 'pdf'

export type StepOutputLinkPreviewState = {
  loading: boolean
  dataUrl?: string
  kind?: StepOutputLinkPreviewKind
  error?: boolean
}

const previewByUrl = new Map<string, StepOutputPreviewState>()
const inflight = new Map<string, Promise<StepOutputPreviewState>>()

export function getStepOutputLinkPreview(
  fileUrl: string,
): StepOutputPreviewState | undefined {
  return previewByUrl.get(fileUrl.trim())
}

export async function fetchStepOutputLinkPreview(
  fileUrl: string,
): Promise<StepOutputPreviewState> {
  const key = fileUrl.trim()
  if (!key) return { loading: false, error: true }

  const cached = previewByUrl.get(key)
  if (cached && !cached.loading) return cached

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = (async (): Promise<StepOutputPreviewState> => {
    previewByUrl.set(key, { loading: true })
    try {
      const channel = window.ipcRendererChannel?.GetStepOutputLinkPreview
      if (!channel?.invoke) {
        const fail = { loading: false, error: true }
        previewByUrl.set(key, fail)
        return fail
      }
      const result = await channel.invoke({ fileUrl: key })
      if (!result?.dataUrl) {
        const empty = { loading: false, error: true }
        previewByUrl.set(key, empty)
        return empty
      }
      const ok: StepOutputPreviewState = {
        loading: false,
        dataUrl: result.dataUrl,
        kind: result.kind,
      }
      previewByUrl.set(key, ok)
      return ok
    } catch {
      const fail = { loading: false, error: true }
      previewByUrl.set(key, fail)
      return fail
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

export function clearStepOutputLinkPreviewCache(): void {
  previewByUrl.clear()
  inflight.clear()
}
