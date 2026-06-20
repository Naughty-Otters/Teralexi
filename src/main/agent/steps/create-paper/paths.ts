import { join } from 'node:path'

export function createPaperOutputDir(sandboxRoot: string): string {
  return join(sandboxRoot, 'createPaper', 'output')
}

export function createPaperOutputPath(
  sandboxRoot: string,
  fileName = 'research-report.pdf',
): string {
  return join(createPaperOutputDir(sandboxRoot), fileName)
}
