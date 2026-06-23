import { tryRenderDiagramSpecJsonToSvg } from '@shared/diagram/render-diagram-spec'

function decodeDiagramSpec(encoded: string): string {
  return decodeURIComponent(encoded)
}

function applySvgToNode(node: HTMLElement, svg: string): void {
  node.classList.remove('diagram-block--pending')
  node.classList.add('diagram-block--ready')
  node.innerHTML = svg
}

function applyErrorToNode(node: HTMLElement, message: string): void {
  node.classList.remove('diagram-block--pending')
  node.classList.add('diagram-block--error')
  node.textContent = message
}

/** Resolve pending diagram placeholders inside a DOM subtree. */
export function hydrateDiagramBlocks(
  root: HTMLElement | null | undefined,
): void {
  if (!root) return
  const nodes = root.querySelectorAll<HTMLElement>(
    '.diagram-block--pending:not([data-diagram-loaded])',
  )
  for (const node of nodes) {
    node.dataset.diagramLoaded = '1'
    const encoded = node.dataset.diagramSpec?.trim()
    if (!encoded) {
      applyErrorToNode(node, 'Missing diagram spec')
      continue
    }
    let raw: string
    try {
      raw = decodeDiagramSpec(encoded)
    } catch {
      applyErrorToNode(node, 'Invalid diagram encoding')
      continue
    }
    const result = tryRenderDiagramSpecJsonToSvg(raw)
    if (result.ok) {
      applySvgToNode(node, result.svg)
    } else {
      applyErrorToNode(node, result.error)
    }
  }
}
