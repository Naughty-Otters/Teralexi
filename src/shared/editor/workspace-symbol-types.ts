/** Workspace symbol row for editor quick navigation. */
export type SharedWorkspaceSymbol = {
  name: string
  kind: string
  path: string
  line: number
  character: number
  container?: string
}
