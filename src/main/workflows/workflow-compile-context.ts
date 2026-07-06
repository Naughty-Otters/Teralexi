export type WorkflowCompileContext = {
  workflowId: string
  workflowName: string
  knownTools?: Set<string>
  /** When set, read/write workflow source files here (used by bundled skill actions in tests). */
  sourceDir?: string
}

const CONTEXT_STACK_KEY = Symbol.for('teralexi.workflowCompileContextStack')

function contextStack(): WorkflowCompileContext[] {
  const g = globalThis as typeof globalThis & {
    [CONTEXT_STACK_KEY]?: WorkflowCompileContext[]
  }
  if (!g[CONTEXT_STACK_KEY]) {
    g[CONTEXT_STACK_KEY] = []
  }
  return g[CONTEXT_STACK_KEY]!
}

/** Bind workflow id/name for skill actions (shared across esbuild skill bundles). */
export function runWithWorkflowCompileContext<T>(
  ctx: WorkflowCompileContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  const stack = contextStack()
  stack.push(ctx)
  return Promise.resolve(fn()).finally(() => {
    stack.pop()
  })
}

export function getWorkflowCompileContext(): WorkflowCompileContext | undefined {
  const stack = contextStack()
  return stack[stack.length - 1]
}

export function requireWorkflowCompileContext(): WorkflowCompileContext {
  const ctx = getWorkflowCompileContext()
  if (!ctx) {
    throw new Error(
      'Workflow compile context is not active — tools must run inside a workflow compiler agent session.',
    )
  }
  return ctx
}
