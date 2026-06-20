import type { ResearchStepContext } from './research-step-context'
import {
  normalizeResearchQuestion,
  type ResearchFinding,
  type ResearchResumeState,
  type ResolvedResearchConfig,
} from './config'
import { formatResearchFindingsMarkdown } from './format-findings'
import { gatherEvidence } from './gather-evidence'
import { generateFollowUpQuestions } from './generate-questions'

export type ResearchLoopResult = {
  topic: string
  findings: ResearchFinding[]
  digestMarkdown: string
  paused: boolean
}

function buildResumeState(
  topic: string,
  findings: ResearchFinding[],
  researchedKeys: Set<string>,
  pendingQuestions: string[],
  round: number,
  totalResearched: number,
): ResearchResumeState {
  return {
    topic,
    findings: [...findings],
    researchedKeys: [...researchedKeys],
    pendingQuestions: [...pendingQuestions],
    round,
    totalResearched,
  }
}

export async function runResearchLoop(
  ctx: ResearchStepContext,
  config: ResolvedResearchConfig,
): Promise<ResearchLoopResult> {
  const resume = ctx.researchResumeState

  const topic = resume?.topic ?? config.topic
  const findings: ResearchFinding[] = resume?.findings ? [...resume.findings] : []
  const researchedKeys = new Set<string>(resume?.researchedKeys ?? [])
  let pendingQuestions = resume?.pendingQuestions?.length
    ? [...resume.pendingQuestions]
    : [topic]
  let round = resume?.round ?? 0
  let totalResearched = resume?.totalResearched ?? 0
  let seq = totalResearched + 1

  if (resume) {
    ctx.researchResumeState = undefined
  }

  ctx.beginStep(undefined, undefined, {
    topic,
    maxRounds: config.maxRounds,
    maxTotalQuestions: config.maxTotalQuestions,
  })

  while (pendingQuestions.length > 0 && round < config.maxRounds) {
    const currentBatch = pendingQuestions
    pendingQuestions = []
    round += 1

    for (const question of currentBatch) {
      const questionKey = normalizeResearchQuestion(question)
      if (researchedKeys.has(questionKey)) continue
      if (totalResearched >= config.maxTotalQuestions) {
        pendingQuestions = []
        break
      }

      researchedKeys.add(questionKey)
      totalResearched += 1

      ctx.emitStepProgress(
        `\n🔍 Research (${totalResearched}/${config.maxTotalQuestions}): ${question}\n\n`,
      )

      const gathered = await gatherEvidence(ctx, question, config, seq, topic)
      seq += 1

      if (gathered.awaitingToolApproval) {
        ctx.hitlAwaitingApproval = true
        ctx.researchResumeState = buildResumeState(
          topic,
          [
            ...findings,
            { question, output: gathered.output, round },
          ],
          researchedKeys,
          [...currentBatch.slice(currentBatch.indexOf(question) + 1), ...pendingQuestions],
          round,
          totalResearched,
        )
        return {
          topic,
          findings,
          digestMarkdown: formatResearchFindingsMarkdown(topic, findings),
          paused: true,
        }
      }

      findings.push({
        question,
        output: gathered.output || '_No substantive output recorded._',
        round,
      })
    }

    if (totalResearched >= config.maxTotalQuestions) break

    const followUps = await generateFollowUpQuestions(ctx, {
      topic,
      findings,
      researchedKeys: [...researchedKeys],
      config,
    })

    if (followUps.sufficient || followUps.questions.length === 0) break

    pendingQuestions = followUps.questions.map((q) => q.question)
  }

  const digestMarkdown = formatResearchFindingsMarkdown(topic, findings)
  return { topic, findings, digestMarkdown, paused: false }
}
