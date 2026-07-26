import type {
  StressPrompt,
  StressScenario,
  StressScenarioFilter,
  StressSkillId,
} from '../types'
import { skillIdToAgentId } from '../types'

function p(
  id: string,
  text: string,
  extra?: Partial<Omit<StressPrompt, 'id' | 'text'>>,
): StressPrompt {
  return { id, text, ...extra }
}

const defaultPrompts: StressPrompt[] = [
  p(
    'default-01',
    'Explain local-first agent architecture in 5 bullets.',
    { tags: ['qa'] },
  ),
  p(
    'default-02',
    'What is the difference between skills and MCP tools?',
    { tags: ['qa'] },
  ),
  p(
    'default-03',
    'Search the web for "Electron process metrics app.getAppMetrics" and summarize the key fields.',
    { expectTools: ['web_search'], tags: ['web'] },
  ),
  p(
    'default-04',
    'Compute Fibonacci(25) with a short sandbox script and show the result.',
    { expectTools: ['run_script'], tags: ['sandbox'] },
  ),
  p(
    'default-05',
    'Brainstorm 8 names for a personal knowledge app.',
    { tags: ['qa'] },
  ),
  p(
    'default-06',
    'Compare Ollama vs cloud LLM for offline coding (pros/cons).',
    { tags: ['qa'] },
  ),
  p(
    'default-07',
    'Scrape a public docs page about SQLite WAL mode and list 3 takeaways.',
    { expectTools: ['web_scrape', 'web_search'], tags: ['web'] },
  ),
  p(
    'default-08',
    'Write a short regex that validates ISO dates; explain edge cases.',
    { tags: ['qa'] },
  ),
  p(
    'default-09',
    'Host metrics: summarize disk/memory/uptime if tools allow; else explain how you would collect them.',
    { tags: ['sandbox'] },
  ),
  p(
    'default-10',
    'Draft a polite status update email body (do not send).',
    { tags: ['qa'] },
  ),
  p(
    'default-11',
    'Explain vector memory vs conversation history for agents.',
    { tags: ['qa'] },
  ),
  p(
    'default-12',
    'Continue: deepen the previous answer with an example workflow.',
    { tags: ['continue'] },
  ),
]

const codingPrompts: StressPrompt[] = [
  p(
    'coding-01',
    'Explore the stress workspace and summarize the repo structure.',
    { expectTools: ['glob_files', 'list_files'], tags: ['explore'] },
  ),
  p(
    'coding-02',
    'Add README.md describing this as a stress-test sandbox.',
    { expectTools: ['write_file'], tags: ['edit'] },
  ),
  p(
    'coding-03',
    'Create src/counter.ts with an increment/decrement Counter class and a unit-testable API.',
    { expectTools: ['write_file'], tags: ['edit'] },
  ),
  p(
    'coding-04',
    'Add a simple test file and run the project’s test or lint command if present (or create a minimal node test).',
    { expectTools: ['write_file', 'run_workspace_command'], tags: ['verify'] },
  ),
  p(
    'coding-05',
    'Refactor Counter to support a step size; update tests.',
    { expectTools: ['edit_file', 'read_file'], tags: ['edit'] },
  ),
  p(
    'coding-06',
    'Fix any typecheck or lint failures you introduced.',
    { expectTools: ['run_workspace_command'], tags: ['verify'] },
  ),
  p(
    'coding-07',
    'Add src/logger.ts with timestamped info/error helpers; use it from a small counter demo.',
    { expectTools: ['write_file'], tags: ['edit'] },
  ),
  p(
    'coding-08',
    'Grep for TODO/FIXME and report findings (read-only pass).',
    { expectTools: ['grep_files'], tags: ['explore'] },
  ),
  p(
    'coding-09',
    'Show git status and git diff summary of sandbox changes.',
    { expectTools: ['git_status', 'git_diff'], tags: ['git'] },
  ),
  p(
    'coding-10',
    'Continue: implement the next smallest improvement you recommend.',
    { tags: ['continue'] },
  ),
]

const codingReviewPrompts: StressPrompt[] = [
  p(
    'coding-review-01',
    'Review the current uncommitted diff; produce a severity table.',
    { expectTools: ['git_diff', 'git_status'], tags: ['review'] },
  ),
  p(
    'coding-review-02',
    'Review src/ for error-handling gaps.',
    { expectTools: ['glob_files', 'read_file'], tags: ['review'] },
  ),
  p(
    'coding-review-03',
    'Security pass: look for command injection or path traversal risks in recent files.',
    { expectTools: ['grep_files', 'read_file'], tags: ['security'] },
  ),
  p(
    'coding-review-04',
    'Explain the control flow of the main entry file if one exists.',
    { expectTools: ['read_file', 'glob_files'], tags: ['review'] },
  ),
  p(
    'coding-review-05',
    'Compare two modules and note coupling issues.',
    { expectTools: ['read_file'], tags: ['review'] },
  ),
  p(
    'coding-review-06',
    'List test coverage gaps for the Counter (or the largest module).',
    { expectTools: ['glob_files', 'read_file'], tags: ['review'] },
  ),
  p(
    'coding-review-07',
    'Re-review after imagining a PR that adds networking — what would you require?',
    { tags: ['review'] },
  ),
  p(
    'coding-review-08',
    'Continue: prioritize the top 3 findings with concrete fix sketches (still no edits).',
    { tags: ['continue'] },
  ),
]

const codingPrPrompts: StressPrompt[] = [
  p(
    'coding-pr-01',
    'Run git status and recent log; summarize the branch state.',
    { expectTools: ['git_status', 'git_log'], tags: ['git'] },
  ),
  p(
    'coding-pr-02',
    'Stage and commit sandbox changes with a why-focused message.',
    { expectTools: ['git_add', 'git_commit'], tags: ['git'] },
  ),
  p(
    'coding-pr-03',
    'Create a branch stress/run-current if currently on main/master.',
    { expectTools: ['run_workspace_command'], tags: ['git'] },
  ),
  p(
    'coding-pr-04',
    'Prepare a PR title and body from the diff. Create a PR only if a remote exists; otherwise stop at a push-ready summary.',
    { expectTools: ['git_diff', 'git_create_pr'], tags: ['git'] },
  ),
  p(
    'coding-pr-05',
    'If hooks rewrote files, amend only when appropriate per project commit rules; otherwise report status.',
    { expectTools: ['git_status'], tags: ['git'] },
  ),
  p(
    'coding-pr-06',
    'Continue: next git hygiene step you would take before merge.',
    { tags: ['continue'] },
  ),
]

const documentsPrompts: StressPrompt[] = [
  p(
    'documents-01',
    'Create a one-page PDF project status report titled "Stress Run Status".',
    { expectTools: ['render_document'], tags: ['pdf'] },
  ),
  p(
    'documents-02',
    'Create an Excel sheet with 10 fictional latency samples and averages.',
    { expectTools: ['render_document'], tags: ['xlsx'] },
  ),
  p(
    'documents-03',
    'Create a 5-slide PowerPoint outlining the stress harness.',
    { expectTools: ['render_document'], tags: ['pptx'] },
  ),
  p(
    'documents-04',
    'Create a Word memo summarizing today’s run goals.',
    { expectTools: ['render_document'], tags: ['docx'] },
  ),
  p(
    'documents-05',
    'Update the spreadsheet: add a p95 column (or regenerate with that field).',
    { expectTools: ['render_document'], tags: ['xlsx'] },
  ),
  p(
    'documents-06',
    'Convert the memo content into a short PDF brief.',
    { expectTools: ['render_document'], tags: ['pdf'] },
  ),
  p(
    'documents-07',
    'List sandbox output/results/ and describe each artifact.',
    { expectTools: ['list_files'], tags: ['sandbox'] },
  ),
  p(
    'documents-08',
    'Continue: produce the next document type you have not made yet in this conversation.',
    { tags: ['continue'] },
  ),
]

const researchPrompts: StressPrompt[] = [
  p(
    'research-01',
    'Write a short research paper: "Measuring desktop AI agent UI responsiveness".',
    { expectTools: ['web_search', 'write_file'], tags: ['paper'] },
  ),
  p(
    'research-02',
    'If a research paper already exists in output/results/, export PDF only (do not restart research).',
    { expectTools: ['list_files', 'export_research_pdf'], tags: ['pdf'] },
  ),
  p(
    'research-03',
    'Expand the Related Work section with 2 more sources.',
    { expectTools: ['web_search', 'write_file'], tags: ['paper'] },
  ),
  p(
    'research-04',
    'Research "Electron memory leaks BrowserWindow" and produce a mini evidence ledger.',
    { expectTools: ['web_search', 'web_scrape'], tags: ['ledger'] },
  ),
  p(
    'research-05',
    'Merge findings into the existing paper’s Results section.',
    { expectTools: ['read_file', 'write_file'], tags: ['paper'] },
  ),
  p(
    'research-06',
    'Promote nothing; list artifact paths and cite sources used.',
    { expectTools: ['list_files'], tags: ['sandbox'] },
  ),
  p(
    'research-07',
    'Continue: propose and then execute the next research follow-up.',
    { tags: ['continue'] },
  ),
]

const websitePrompts: StressPrompt[] = [
  p(
    'website-01',
    'Ensure the workspace is this stress folder. Build a minimal landing page titled "Teralexi Stress Lab".',
    { expectTools: ['render_website'], tags: ['site'] },
  ),
  p(
    'website-02',
    'Add an About page and shared CSS.',
    { expectTools: ['render_website'], tags: ['site'] },
  ),
  p(
    'website-03',
    'Restyle with a darker professional theme (still static HTML/CSS/JS).',
    { expectTools: ['render_website'], tags: ['site'] },
  ),
  p(
    'website-04',
    'Add a simple client-side metrics table page with static placeholder numbers.',
    { expectTools: ['render_website'], tags: ['site'] },
  ),
  p(
    'website-05',
    'Preview/list sandbox site files; promote into workspace sites/stress-lab/ when ready.',
    { expectTools: ['list_files', 'promote_artifact'], tags: ['site'] },
  ),
  p(
    'website-06',
    'Update the hero copy to mention long-run soak testing.',
    { expectTools: ['render_website'], tags: ['site'] },
  ),
  p(
    'website-07',
    'Continue: next polish pass (a11y, mobile nav, or footer).',
    { tags: ['continue'] },
  ),
]

const googleWorkspacePrompts: StressPrompt[] = [
  p(
    'gws-01',
    'Check google_workspace_auth_status and report sign-in / scopes.',
    {
      expectTools: ['google_workspace_auth_status'],
      requiresAuth: false,
      tags: ['auth'],
    },
  ),
  p(
    'gws-02',
    'List unread Gmail (max 5); summarize subjects.',
    {
      expectTools: ['google_gmail_list_messages'],
      requiresAuth: true,
      tags: ['gmail'],
    },
  ),
  p(
    'gws-03',
    'Get today’s calendar events.',
    {
      expectTools: ['google_calendar_list_events'],
      requiresAuth: true,
      tags: ['calendar'],
    },
  ),
  p(
    'gws-04',
    'Search Drive for files modified this month (limit 5).',
    {
      expectTools: ['google_drive_list_files'],
      requiresAuth: true,
      tags: ['drive'],
    },
  ),
  p(
    'gws-05',
    'Open one message or file metadata only (no send/download).',
    {
      expectTools: ['google_gmail_get_message', 'google_drive_get_file'],
      requiresAuth: true,
      tags: ['read'],
    },
  ),
  p(
    'gws-06',
    'Draft (do not send) an email summarizing stress-test progress.',
    { requiresAuth: true, writeAction: false, tags: ['draft'] },
  ),
  p(
    'gws-07',
    'Find free slots tomorrow afternoon (read calendar only).',
    {
      expectTools: ['google_calendar_list_events'],
      requiresAuth: true,
      tags: ['calendar'],
    },
  ),
  p(
    'gws-08',
    'Continue: next read-only Workspace triage step.',
    { requiresAuth: true, tags: ['continue'] },
  ),
]

const PROMPTS: Record<StressSkillId, StressPrompt[]> = {
  default: defaultPrompts,
  coding: codingPrompts,
  'coding-pr': codingPrPrompts,
  'coding-review': codingReviewPrompts,
  documents: documentsPrompts,
  research: researchPrompts,
  website: websitePrompts,
  'google-workspace': googleWorkspacePrompts,
}

const LABELS: Record<StressSkillId, string> = {
  default: 'Default',
  coding: 'Coding',
  'coding-pr': 'Coding PR',
  'coding-review': 'Coding Review',
  documents: 'Documents',
  research: 'Research',
  website: 'Website',
  'google-workspace': 'Google Workspace',
}

const NEEDS_WORKSPACE: ReadonlySet<StressSkillId> = new Set([
  'coding',
  'coding-pr',
  'coding-review',
  'website',
])

export function buildStressScenario(skillId: StressSkillId): StressScenario {
  return {
    skillId,
    agentId: skillIdToAgentId(skillId),
    label: LABELS[skillId],
    needsWorkspace: NEEDS_WORKSPACE.has(skillId),
    prompts: PROMPTS[skillId],
  }
}

export function getAllStressScenarios(): StressScenario[] {
  return (Object.keys(PROMPTS) as StressSkillId[]).map(buildStressScenario)
}

export function getStressScenariosForFilter(
  filter: StressScenarioFilter | 'all' | StressSkillId,
): StressScenario[] {
  if (filter === 'all') return getAllStressScenarios()
  if (typeof filter === 'string') return [buildStressScenario(filter)]
  if (filter.length === 0) return []
  const seen = new Set<StressSkillId>()
  const out: StressScenario[] = []
  for (const id of filter) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(buildStressScenario(id))
  }
  return out
}

/** Prompt used during ai-continue / hybrid phase to ask the model for the next user turn. */
export function buildAiContinueGeneratorPrompt(skillId: StressSkillId): string {
  return [
    `You are helping generate the next stress-test user message for the "${skillId}" skill.`,
    'Based on the conversation so far, reply with ONLY the next user request as plain text.',
    'One or two sentences. Stay on-skill. Do not use markdown fences or labels.',
    'Prefer actionable tasks that exercise tools for this skill.',
  ].join(' ')
}
