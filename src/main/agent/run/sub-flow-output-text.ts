import type { StepOutputs } from '../types'

export function mergeSubFlowOutputText(
  stepOutputs: StepOutputs,
  merge: 'report' | 'summary' | 'all' = 'report',
): string {
  if (merge === 'summary' && stepOutputs.summary?.summary?.trim()) {
    return stepOutputs.summary.summary.trim()
  }
  if (merge === 'report' && stepOutputs.report?.trim()) {
    return stepOutputs.report.trim()
  }
  const parts: string[] = []
  if (stepOutputs.report?.trim()) parts.push(stepOutputs.report.trim())
  if (stepOutputs.summary?.summary?.trim()) {
    parts.push(stepOutputs.summary.summary.trim())
  }
  if (stepOutputs.toolLoop?.trim()) parts.push(stepOutputs.toolLoop.trim())
  return parts.join('\n\n') || 'Sub-agent completed with no report output.'
}
