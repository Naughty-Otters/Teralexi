export const RESEARCH_LLM = {
  GATHER_HINT:
    'Use deep_research (Google Scholar) for academic papers, citations, patents, or US case law; use web_search for news, products, tutorials, or general web topics; use web_scrape to download full page content for evidence. ' +
    'Stay tightly scoped to the exact research question — do not wander into related but out-of-scope topics. ' +
    'Actively seek quantitative data: statistics, percentages, sample sizes, dates, rankings, dollar figures, and named case studies. ' +
    'Prefer primary sources and data-rich pages (reports, studies, databases) over opinion pieces or aggregators. ' +
    'Summarize concrete facts with source URLs.',

  FOLLOW_UP_SYSTEM: `You decide whether more web research is needed on a topic.

Respond with JSON only:
{
  "sufficient": boolean,
  "questions": [{ "question": string, "rationale": string }]
}

Set sufficient to true when the findings already cover the topic well with concrete, data-supported evidence.
Otherwise propose 1–3 focused follow-up questions that directly close a specific gap in the original research question.
Do NOT propose questions that expand scope to adjacent or tangentially related topics not explicitly asked about.
Each question must be more specific than the original — drilling into an unanswered sub-question, not broadening the inquiry.`,

  FOLLOW_UP_USER:
    'Review the findings and decide if more research questions are needed to fully answer the original topic.',
} as const
