import type { ResearchStepContext } from './research-step-context'
import { runExpressionLlmText } from '../../expr/run-expression-llm'
import type { ResearchFinding, ResolvedResearchConfig } from './config'
import { RESEARCH_LLM } from './research-llm'

export type FollowUpQuestion = {
  question: string
  rationale?: string
}

export type FollowUpQuestionsResult = {
  sufficient: boolean
  questions: FollowUpQuestion[]
}

export async function generateFollowUpQuestions(
  ctx: ResearchStepContext,
  input: {
    topic: string
    findings: ResearchFinding[]
    researchedKeys: string[]
    config: ResolvedResearchConfig
  },
): Promise<FollowUpQuestionsResult> {
  const system =
    input.config.followUpPrompt?.trim() || RESEARCH_LLM.FOLLOW_UP_SYSTEM
  const findingsBlock = input.findings
    .map(
      (f, i) =>
        `### Finding ${i + 1}: ${f.question}\n\n${f.output.trim() || '_empty_'}`,
    )
    .join('\n\n')

  const userPrompt = [
    RESEARCH_LLM.FOLLOW_UP_USER,
    '',
    `Topic: ${input.topic}`,
    '',
    'Findings so far:',
    findingsBlock || '_None yet._',
    '',
    `Questions already researched (${input.researchedKeys.length}):`,
    input.researchedKeys.length
      ? input.researchedKeys.map((k) => `- ${k}`).join('\n')
      : '_None._',
  ].join('\n')

  const raw = await runExpressionLlmText(
    ctx,
    { instructions: system, userPrompt },
    ctx.currentMessages,
    { maxOutputTokens: 2048, streamToProgress: false },
  )

  return parseFollowUpQuestionsResponse(raw)
}

function parseFollowUpQuestionsResponse(raw: string): FollowUpQuestionsResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { sufficient: true, questions: [] }
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      sufficient?: boolean
      questions?: Array<{ question?: string; rationale?: string }>
    }
    const questions = (parsed.questions ?? [])
      .map((q) => ({
        question: q.question?.trim() ?? '',
        rationale: q.rationale?.trim(),
      }))
      .filter((q) => q.question.length > 0)
    return {
      sufficient: parsed.sufficient === true || questions.length === 0,
      questions,
    }
  } catch {
    return { sufficient: true, questions: [] }
  }
}
