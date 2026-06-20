import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  getWorkspacePathFromEnv,
  requireActiveSandbox,
  resolvePathInContext,
  sandboxPathError,
} from './sandbox-paths'
import { getLspManager, type SymbolOperation } from '@main/agent/lsp'

const LSP_TAG = ['code-intelligence'] as const

const OPERATIONS = [
  'definition',
  'references',
  'hover',
  'document_symbols',
  'workspace_symbols',
  'implementation',
] as const

/**
 * lsp — Language Server Protocol code intelligence over the user's workspace.
 *
 * Reuses the same long-lived language servers as edit-time diagnostics. Line and
 * character are 1-based (as shown by read_file and in editors).
 */
export const lspTool: SkillTool = {
  name: 'lsp',
  tags: [...LSP_TAG],
  description:
    'Code intelligence via the language server. Operations: ' +
    'definition (where a symbol is defined), references (all uses), implementation (impls of an interface/abstract), ' +
    'hover (type/doc at a position), document_symbols (outline of one file), workspace_symbols (project-wide symbol search by name). ' +
    'Position ops (definition/references/hover/implementation) need 1-based line & character. ' +
    'workspace_symbols needs query. Requires a workspace folder. Prefer this over grep for navigating code by symbol.',
  inputSchema: z.object({
    operation: z.enum(OPERATIONS).describe('Which code-intelligence query to run.'),
    path: z
      .string()
      .min(1)
      .describe('File path (workspace-relative or absolute). For workspace_symbols, used to pick the language server.'),
    line: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-based line (required for definition/references/hover/implementation).'),
    character: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-based column (required for definition/references/hover/implementation).'),
    query: z
      .string()
      .optional()
      .describe('Symbol name to search for (required for workspace_symbols).'),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z
      .object({
        operation: z.enum(OPERATIONS),
        path: z.string().min(1),
        line: z.number().optional(),
        character: z.number().optional(),
        query: z.string().optional(),
      })
      .safeParse(input)
    if (!parsed.success) {
      return { error: 'Invalid lsp input.', detail: parsed.error.flatten() }
    }

    const workspaceRoot = getWorkspacePathFromEnv()
    if (!workspaceRoot) {
      return {
        error:
          'Code intelligence requires a workspace folder. Ask the user to select one for this conversation.',
      }
    }

    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }

    const { operation, path, line, character, query } = parsed.data
    if (operation === 'workspace_symbols' && !query?.trim()) {
      return { error: 'workspace_symbols requires a non-empty query.' }
    }

    let absFilePath: string
    try {
      absFilePath = resolvePathInContext(sandbox.root, workspaceRoot, path)
    } catch (err) {
      return sandboxPathError(err)
    }
    return getLspManager().querySymbols({
      operation: operation as SymbolOperation,
      absFilePath,
      workspaceRoot,
      line,
      character,
      query,
    })
  },
}

export const lspTools: SkillTool[] = [lspTool]
