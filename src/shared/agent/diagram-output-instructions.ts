/** Agent instructions for DiagramSpec v1 markdown fences (shared by injectors and thinking). */

export const DIAGRAM_NO_RUN_SCRIPT_RULE = `**Do not** use \`run_script\`, Python, or matplotlib to draw inline plots, function graphs, or architecture diagrams for the user — the app renders \`\`\`diagram\` JSON fences as SVG in chat and reports. Use \`run_script\` only when the deliverable must be a sandbox file (data export, generated asset on disk, subprocess metrics, etc.).`

export const DIAGRAM_OUTPUT_INSTRUCTIONS = `## Diagrams (DiagramSpec v1)

${DIAGRAM_NO_RUN_SCRIPT_RULE}

When a visual clarifies architecture, flow, math, or geometry in **user-facing markdown**, include a fenced diagram block with JSON:

\`\`\`diagram
{
  "version": 1,
  "viewBox": [0, 0, 960, 540],
  "layers": [
    { "type": "graph", "direction": "LR", "nodes": [...], "edges": [...] },
    { "type": "plot", "at": { "x": 40, "y": 60, "width": 420, "height": 240 }, "fn": "sin(x)", "domain": [-6.28, 6.28] },
    { "type": "math", "latex": "E = mc^2", "at": { "x": 40, "y": 36 } },
    { "type": "shape", "items": [{ "kind": "arrow", "from": { "x": 0, "y": 0 }, "to": { "x": 100, "y": 0 } }] },
    { "type": "text", "items": [{ "at": { "x": 40, "y": 320 }, "text": "Caption" }] }
  ]
}
\`\`\`

Layer types:
- \`graph\`: architecture, dependencies, flows (direction \`TB\` or \`LR\`)
- \`plot\`: math curves; \`fn\` uses variable \`x\`; set \`domain\` (and optional \`range\`)
- \`math\`: standalone LaTeX
- \`shape\`: lines, arrows, rects, circles, polygons, paths
- \`text\`: captions and labels

When to use:
- User asks to explain, plot, graph, chart, or visualize a function or system
- Architecture or process is easier to see than to read as prose
- Math functions or geometry benefit from a figure (include a \`plot\` or \`graph\` layer)

When to skip:
- Short factual answers with no visual benefit
- Mid tool-loop status messages (keep those concise)
- Invalid or incomplete JSON (the UI will show an error)

Always set \`"version": 1\`. Prefer one combined spec over multiple diagram fences.`

export const DIAGRAM_DIRECT_ANSWER_RETRY_HINT = `Routing correction: answer this request as **direct_answer**. Write the full user-facing reply in \`response\` with prose and a \`\`\`diagram\` JSON fence (use a \`plot\` layer when graphing a function). Do not use agent_call, run_script, Python, or matplotlib for inline charts.`

/** Compact routing hint for the thinking step (token-budget friendly). */
export const DIAGRAM_THINKING_ROUTING_HINT = `## Inline diagrams (built-in SVG)

For **explain / plot / graph / visualize** requests about math functions or simple architecture (e.g. "explain sin(x)", "show the request flow"):
- Choose **direct_answer** and put prose plus a \`\`\`diagram\` fence in \`response\` (use a \`plot\` layer: \`"fn": "sin(x)"\`, \`domain\`, optional \`range\`).
- Do **not** choose agent_call just to run Python/matplotlib or \`run_script\` for an inline chart.

${DIAGRAM_NO_RUN_SCRIPT_RULE}`
