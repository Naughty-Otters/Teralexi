# Standard research paper structure (7 parts)

Reference: [ThesisAI — How to structure a research paper](https://www.thesisai.io/blog/how-to-structure-a-research-paper/)

A research paper is a formal document that investigates a question using scholarly sources, evidence-based analysis, and a clear logical structure.

## The seven parts

| # | Section | Purpose | Typical length |
|---|---------|---------|----------------|
| 1 | **Title** | Clear, specific, searchable; states topic and scope | 10–15 words |
| 2 | **Abstract** | Standalone summary: question, approach, key findings, conclusion | 150–250 words |
| 3 | **Introduction** | Context, problem, research question, why it matters, roadmap | 10–15% of paper |
| 4 | **Literature Review** | Prior work, themes, gaps, how this paper fits | 20–30% |
| 5 | **Methodology** | How evidence was gathered and analyzed (reproducible) | 10–15% |
| 6 | **Results** | Findings organized by theme or sub-question; data and quotes | 25–35% |
| 7 | **Discussion & Conclusion** | Interpret findings, limitations, implications, future work | 10–15% |

Plus **References** — numbered list matching inline citations `[1]`, `[2]`, …

## Section guidance

### Title
- Specific enough to distinguish from generic topics.
- Avoid vague titles like "A Study of AI".

### Abstract
- One paragraph (or two short ones): background → question → method (brief) → main findings → conclusion.
- Must stand alone; reader should understand the paper without reading further.

### Introduction
- Hook with context and significance.
- State the **research question** explicitly.
- Preview structure ("Section 4 reviews… Section 6 presents…").

### Literature Review
- Synthesize sources; do not list summaries one-by-one.
- Group by theme or chronology.
- Identify consensus, debate, and gaps.

### Methodology
For agent-conducted research (no primary experiment), describe:
- Query variants generated (rephrases, translations).
- Search tools used (`web_search` / scholarly queries).
- URL selection criteria and scraping approach.
- How evidence was coded, deduplicated, and synthesized.

### Results
- Present findings neutrally; save interpretation for Discussion.
- Use subheadings aligned to research sub-questions.
- Every factual claim carries an inline citation `[n]`.

### Discussion & Conclusion
- Answer the research question directly.
- Compare findings to literature.
- State limitations (source bias, date range, language, paywalls).
- Suggest future research or open questions.

## Citation rules

- Inline: `[1]`, `[2–4]`, `[1, 5]` immediately after the supported claim.
- **No uncited factual claims** — statistics, dates, names, causal statements, rankings.
- References entry format: `[n] Author or Organization. *Title*. URL. Accessed YYYY-MM-DD.`
- Prefer primary sources (papers, official reports, datasets) over aggregators.

## Humanities variant

When the topic is humanities-focused, Literature Review may be split into thematic sections; Methodology may be shorter; Results and Discussion may merge — but still keep numbered citations throughout.
