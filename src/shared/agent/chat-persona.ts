/** Display name for the assistant in conversation bubbles (persona, not agent id). */
export const ASSISTANT_CHAT_DISPLAY_NAME = 'Teralexi'

const SECTION_ID_ALIASES: Record<string, string> = {
  thinking: 'ThinkingStep',
  planning: 'PlanningStep',
  toolLoop: 'SkillsToolExecutionStep',
  foreachItem: 'SkillsToolExecutionStep',
  summary: 'SummaryStep',
  report: 'ReportStep',
  createPaper: 'CreatePaperStep',
  researchReport: 'CreatePaperStep',
}

function normalizeSectionId(sectionId: string): string {
  return SECTION_ID_ALIASES[sectionId] ?? sectionId
}

/** Casual activity line beside the speaker name — varies by step so it feels like a person. */
export function assistantBubbleActivityLabel(
  sectionId: string,
  status: 'running' | 'done' = 'done',
  opts?: { attachments?: boolean },
): string {
  if (opts?.attachments) {
    return status === 'running' ? 'gathering files…' : 'shared some files'
  }

  const id = normalizeSectionId(sectionId)

  if (status === 'running') {
    const running: Record<string, string> = {
      ThinkingStep: 'thinking…',
      PlanningStep: 'looking into this…',
      SkillsToolExecutionStep: 'working on it…',
      SummaryStep: 'pulling it together…',
      AnalysisStep: 'pulling it together…',
      ReportStep: 'writing this up…',
      CreatePaperStep: 'researching…',
    }
    return running[id] ?? 'typing…'
  }

  const done: Record<string, string> = {
    ThinkingStep: 'shared a thought',
    PlanningStep: 'explored the options',
    SkillsToolExecutionStep: '',
    SummaryStep: 'wrapped up',
    AnalysisStep: 'wrapped up',
    ReportStep: 'shared a report',
    CreatePaperStep: 'shared research',
    finalResult: 'replied',
    resultSnapshot: 'attached a snapshot',
    llmError: 'hit a snag',
    agentError: 'hit a snag',
  }
  return done[id] ?? 'said something'
}

export function assistantBubbleSpeakerName(): string {
  return ASSISTANT_CHAT_DISPLAY_NAME
}

/** Brief / step-progress disclosure title — same persona as conversation bubbles. */
export function assistantStepProgressDisplayTitle(): string {
  return ASSISTANT_CHAT_DISPLAY_NAME
}
