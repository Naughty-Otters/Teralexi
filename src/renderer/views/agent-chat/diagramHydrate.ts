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

/**
 * Resolve pending diagram placeholders inside a DOM subtree.
 * Dynamically imports the diagram renderer (katex/mathjs/dagre) on first use.
 * Rollup/Vite still emit those packages as async chunks from this `import()`.
 */
export async function hydrateDiagramBlocks(
  root: HTMLElement | null | undefined,
): Promise<void> {
  if (!root) return
  const nodes = root.querySelectorAll<HTMLElement>(
    '.diagram-block--pending:not([data-diagram-loaded])',
  )
  if (nodes.length === 0) return

  const { tryRenderDiagramSpecJsonToSvg } = await import(
    '@shared/diagram/render-diagram-spec'
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
    const result = await tryRenderDiagramSpecJsonToSvg(raw)
    if (result.ok) {
      applySvgToNode(node, result.svg)
    } else {
      applyErrorToNode(node, result.error)
    }
  }
}
