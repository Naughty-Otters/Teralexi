import { fetchStepOutputLinkPreview } from './stepOutputLinkPreview'

function applyPreviewToNode(
  node: HTMLElement,
  dataUrl: string,
): void {
  node.classList.remove('step-output-link-preview--loading', 'step-output-link-preview--error')
  const img = document.createElement('img')
  img.src = dataUrl
  img.alt = ''
  img.className = 'step-output-link-preview__img'
  img.loading = 'lazy'
  node.replaceChildren(img)
}

export async function hydrateStepOutputLinkPreviews(
  root: HTMLElement | null | undefined,
): Promise<void> {
  if (!root) return
  const nodes = root.querySelectorAll<HTMLElement>(
    '[data-step-output-preview-url]:not([data-preview-loaded])',
  )
  await Promise.all(
    [...nodes].map(async (node) => {
      const url = node.dataset.stepOutputPreviewUrl?.trim()
      if (!url) return
      node.dataset.previewLoaded = '1'
      const state = await fetchStepOutputLinkPreview(url)
      if (state.dataUrl) {
        applyPreviewToNode(node, state.dataUrl)
        return
      }
      node.remove()
    }),
  )
}
