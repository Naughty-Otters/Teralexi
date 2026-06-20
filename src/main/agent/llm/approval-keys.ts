export function toolCallIdFromRecord(rec: Record<string, unknown>): string {
  return typeof rec.toolCallId === 'string' ? rec.toolCallId : 'unknown'
}

export function addPendingApprovalKeys(
  pending: Set<string>,
  rec: Record<string, unknown>,
): void {
  const toolCallId = rec.toolCallId
  if (typeof toolCallId === 'string' && toolCallId.trim()) {
    pending.add(toolCallId.trim())
  }
  const approvalId = rec.approvalId
  if (typeof approvalId === 'string' && approvalId.trim()) {
    pending.add(`approval:${approvalId.trim()}`)
  }
}

export function clearPendingApprovalKeys(
  pending: Set<string>,
  rec: Record<string, unknown>,
): void {
  const toolCallId = toolCallIdFromRecord(rec)
  if (toolCallId !== 'unknown') pending.delete(toolCallId)
  const approvalId = rec.approvalId
  if (typeof approvalId === 'string' && approvalId.trim()) {
    pending.delete(`approval:${approvalId.trim()}`)
  }
}

export function clearPendingApprovalForToolCallId(
  pending: Set<string>,
  toolCallId: string,
): void {
  const id = toolCallId.trim()
  if (!id) return
  pending.delete(id)
}
