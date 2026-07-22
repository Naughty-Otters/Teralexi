# Skill development guide

Step-by-step tutorial for building a **teralexi agent skill**. Skills are folders of markdown (and optional scripts) that tell the agent **what to do**, **which tools to use**, and **how to plan multi-step work**.

---

## Before you start

| Location | Purpose |
|----------|---------|
| `skills/` in the repo | Bundled skill folders shipped with the app (`default`, …) |
| `toolSet/` in the repo | Bundled shared tools (sibling of `skills/`, not inside it) |
| `~/.teralexi/skills/` | **Your skills** — install here; same folder name **overrides** bundled skills |

> **Note:** The user install path is `~/.teralexi/skills/` (plural), not `~/.teralexi/skill`.

A skill is **loadable** when its folder contains at least `skill.md`. teralexi also expects valid metadata in `properties.md` (or YAML frontmatter inside `skill.md`).

**Reserved folder names** under `skills/` (do not use as skill ids): `common`, `node_modules`, `__pycache__`, or any name starting with `.`.

**Reference skills to copy:**

| Skill | Path | Good for learning |
|-------|------|-------------------|
| Default assistant | `skills/default/` | Minimal skill, tools list, examples |
| GitHub | `skills/github/` | `git_*` and `github_*` tools in `actions/` (not global toolSet) |
| Google Workspace | `skills/google-workspace/` | Gmail, Calendar, Drive via Google OAuth; `google_*` tools live in `actions/` (not global toolSet) |
| One-step HITL test | `~/.teralexi/skills/one-step-hitl-test/` | Single todo, optional form, one script run |
| Multi-step quote test | `~/.teralexi/skills/multi-step-quote-test/` | Workflow table, forms, refs, Python sort chain |

---

## Step 1 — Create the skill folder

Pick a **folder id** (lowercase, hyphens, no spaces). This id is the skill key everywhere in teralexi.

```bash
mkdir -p ~/.teralexi/skills/my-skill
cd ~/.teralexi/skills/my-skill
```

Optional subfolders (defaults shown; override via `refs_dir`, `scripts_dir`, `form_dir` in `properties.md`):

```
my-skill/
├── properties.md      # required metadata (+ optional attachment dir overrides)
├── skill.md           # required — main instructions
├── refs/              # default reference docs (or your `refs_dir`)
├── form/              # default HITL forms (or your `form_dir`)
├── scripts/           # default scripts (or your `scripts_dir`)
└── actions/           # advanced: custom TypeScript tools (optional)
```

Restart the app or reload skills after adding a new folder so teralexi picks it up.

---

## Step 2 — Write `properties.md`

Metadata drives the UI card and model routing. Use simple `key: value` lines (no nested YAML required).

```markdown
name: My Skill
description: Short sentence shown in the skill picker — include trigger phrases.
model: gemma4
provider: ollama
color: primary
enabled: true
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Display name |
| `description` | yes | Include **what** the skill does and **when** to select it |
| `model` | yes | Provider model id |
| `provider` | yes | `ollama`, `llamacpp`, `openai`, `anthropic`, `gemini`, `deepseek`, `moonshot`, `qwen`, `bytedance`, `huggingface`, `nvidia-nim`, or `custom` |
| `color` | no | UI accent: `primary`, `secondary`, `success`, `info`, `warning`, `error`, `neutral` |
| `enabled` | no | `true` / `false` (default `true`) |
| `refs_dir` | no | Comma-separated reference doc folders (default `refs`; entries may be nested, e.g. `assets/refs`) |
| `scripts_dir` | no | Comma-separated script folders (default `scripts`) |
| `form_dir` | no | Comma-separated HITL form folders (default `form`) |
| `allowed_tools` | no | Comma-separated **shared toolSet** tool names for this skill's catalog and default AvailableSet (e.g. `read_file, shell`). Other skills do not see tools listed here. Tools from this skill's `actions/` folder (including nested `actions/<subdir>/`) are tagged `skill:<id>`, belong only to this skill, and are **always** enabled by default with `allowed_tools` |
| `group` | no | Skill family id for grouped UI (e.g. `coding`) |
| `group_label` | no | Display label for the family (e.g. `Coding`) |
| `variant` | no | Variant key within the group (e.g. `review`) |
| `variant_label` | no | Short picker label (e.g. `Review`) |
| `group_order` | no | Sort order for group sections in picker/settings |
| `variant_order` | no | Sort order within a group |
| `group_primary` | no | Marks the default variant when user picks the family |

**Description (discovery):** Write in third person. Include **what** the skill does and **when** to select it (trigger phrases). Example: *"Edits and verifies code in the user workspace. Use when fixing bugs or running tests — not for general Q&A."*

### Project rules (Cursor-style `.cursor/rules`)

Persistent conventions live outside skills:

| Location | Scope |
|----------|--------|
| `~/.teralexi/rules/*.md` | Global — all projects |
| `<workspace>/.teralexi/rules/*.md` | Project-specific |

Rules are injected into every agent run (after skill instructions). Use for commit style, test commands, or team standards — keep each file focused and under ~50 lines.

Example in this repo: [`.teralexi/rules/coding-standards.md`](../.teralexi/rules/coding-standards.md).

### Bundled coding sub-skills

| Skill | When |
|-------|------|
| `coding` | Implement, test, verify in workspace |
| `coding-review` | Read-only PR/diff review |
| `coding-pr` | Commit, push, open PR |

Copy patterns from `skills/coding/refs/` for plan modes, sub-agents, and procedural contracts.

If `properties.md` is missing, teralexi falls back to defaults (`gemma4` / `ollama`) or frontmatter in `skill.md`.

Invalid segments are skipped; if none remain valid for a key, that category falls back to its default folder.

### Example with custom attachment folders

```markdown
name: My Skill
description: Demo with custom asset layout.
model: gemma4
provider: ollama
color: primary
enabled: true
refs_dir: refs, docs, shared/refs
scripts_dir: scripts, bin
form_dir: form, hitl
allowed_tools: read_file, edit_files, shell
```

Planner `reference_url` values must still be **paths under the skill folder**, e.g. `docs/report-format.md`, `bin/run.py`, `hitl/search.form.md`. The settings UI lists files from **all** configured folders for each category.

### Workspace vs sandbox (skill design)

| Skill type | `allowed_tools` | `skill.md` tone |
|------------|-----------------|-----------------|
| **Coding** | Core file tools + `lsp`, `invoke_agents`; lean allow-list (no tag expansion) | Project paths; see `skills/coding/refs/` |
| **Coding Review / PR** | Explicit read-only or git-only lists; **no** tag expansion | Sub-skills for review vs PR workflows |
| **Default** | `shell`, web only; **no** file/workspace expansion | Sandbox-first; suggest Coding for repo edits |
| **Documents** | Doc tools + `shell`; `read_file` for user data | Deliverables → `output/results/`; do not edit user repo |

Shared path rules live in the toolSet (`WORKSPACE_PATH_HINT` / shell descriptions). See [`CODING.md`](../CODING.md#workspace-vs-sandbox).

---

## Step 3 — Write `skill.md` (core instructions)

`skill.md` uses `## Section` headings. teralexi parses these sections:

| Section | Required | Used for |
|---------|----------|----------|
| `## Instructions` | **yes** | System prompt + planning behavior |
| `## Tools` | recommended | Whitelist of tool names (one per bullet) |
| `## Examples` | optional | Few-shot `### User` / `### Assistant` pairs |
| `## Summary` | optional* | Inline summary rules (*prefer `summary.md`) |
| `## Report` | optional* | Inline report rules (*prefer `report.md`) |

### Minimal template

```markdown
## Instructions

You are …

### Trigger

Phrases like **“my trigger phrase”** should load this workflow.

### Workflow

Describe ordered steps or link to a table below.

## Tools

- read_file
- edit_files
- shell
- run_script
- run_script_file
- web_search

## Examples

### User

Run my skill with example input.

### Assistant

Brief description of what the agent should do first.
```

### Authoring tips

1. **One canonical workflow** — Put the ordered todo chain in **one place** (usually a markdown table in `skill.md`). Planning reads this; do not duplicate conflicting lists elsewhere.
2. **Trigger phrases** — Help the agent and users discover when to use the skill.
3. **Execution discipline** — State sandbox rules explicitly (paths under `output/`, script tools only, no raw shell one-liners).
4. **Link attachments** — Use relative links: `[form/my.form.md](form/my.form.md)`, `refs/format.md`, `scripts/run.sh`.

See `skills/default/skill.md` for a small example and `~/.teralexi/skills/one-step-hitl-test/skill.md` for a single-todo table.

---

Keep summary **facts-only** (paths, task order, errors). Keep report **short and addressed to the user**.

---

## Step 5 — Declare tools

List tool names under `## Tools` in `skill.md` (bullets or comma-separated). Names must match registered tools — commonly from bundled `toolSet/`:

| Tool | Typical use |
|------|-------------|
| `read_file` | Line-numbered read with `offset`/`limit`; lists directories |
| `edit_files` | Unified create/update/delete (`mode`: `replace` \| `write` \| `delete` \| `patch`) |
| `shell` | Workspace / OS shell (`rg`, `find`, `git`, tests, host metrics) |
| `run_script` | Inline sandbox script (`scriptType` + `scriptContent`) |
| `run_script_file` | Run an existing file under sandbox `scripts/` |
| `lsp` | Code intelligence (definitions, references, diagnostics) |
| `web_search`, `web_scrape` | Web research and page extraction |
| `read_todos`, `update_todos` | Task tracking |
| `enter_plan_mode`, `exit_plan_mode` | Explore / plan mode |
| `invoke_agents` | Delegate to sub-agents |
| `promote_artifact` | Copy sandbox deliverables into the workspace |
| `generate_follow_up` | Follow-up suggestion chips |
| `github_*` | GitHub skill `actions/` only (not global toolSet) |

**Shell / script discipline:** Prefer `shell` argv for project commands (git/`rg`/tests). Prefer `run_script` / `run_script_file` for sandbox transforms and host metrics. There are no separate `git_*` / `grep_files` catalog tools.

Custom tools: add TypeScript modules under `actions/` (advanced; see `src/main/skills/skill-module-loader.ts`).

---

## Step 6 — Add reference documents (`refs/`)

Reference docs explain **formats, APIs, or report shapes** for the agent. They are attached to todos during **planning** via `reference_doc` on each `todoList` item.

Example: `refs/report-format.md` in `multi-step-quote-test` defines JSON shape and final report sections.

```markdown
# My artifact format

## Required fields
…
```

In `skill.md`, document which todo should import which ref:

| Todo | `reference_doc` |
|------|-----------------|
| 3 | `refs/report-format.md` |

---

## Step 7 — Add scripts (`scripts/`)

Scripts are copied into the conversation sandbox at `scripts/` when listed on a todo as `reference_scripts`.

```
scripts/
├── run-user-command.sh
├── sort_script.py
└── process-sample.mjs
```

In `skill.md`:

- Name each script and its language.
- Say which todo attaches it via `reference_scripts`.
- Document expected `scriptArgs` and output paths (usually under `output/toolLoop/<step-id>/results/`).

Example from `one-step-hitl-test`: todo 1 attaches `scripts/run-user-command.sh`; executor calls `runScriptFile` with `scriptArgs: ["<command>"]`.

---

## Step 8 — Add forms (`form/`) for human-in-the-loop

Forms collect user input mid-run. Each form is a markdown file under `form/`.

### 8a. Write the form doc

Structure:

1. Human-readable purpose and field tables (for the agent and docs).
2. HTML comment with JSON schema at the bottom:

```markdown
# My form title

## Section A — Fields

| Field | Description |
|-------|-------------|
| `my_field` | … |

<!-- FORM_SCHEMA
{"fields":[
  {"key":"my_field","label":"…","type":"string","required":true}
]}
-->
```

Field types include `string`, `text`, `boolean`, `select`. Use `optionsFrom` in `select` to load choices from a prior artifact (see `form/quote-search.form.md`).

### 8b. Wire the form in planning

On the todo that needs input, set in planning JSON:

- `reference_doc`: `[{ "name": "my.form.md", "reference_url": "form/my.form.md" }]`
- `form_doc_name`: `"my.form.md"` (must match `name` in `reference_doc`)

The runtime **skips** the form when the model can infer all required values from the user message (see `one-step-hitl-test` examples table).

### 8c. Gate downstream tools

In `skill.md`, state clearly: **do not** call script tools until required form fields are known.

---

## Step 9 — Define the workflow table (multi-step skills)

For skills with ordered todos, add a table in `## Instructions` like this:

| Order | Todo theme | Depends on | Output artifact | `reference_doc` / `reference_scripts` |
|-------|------------|------------|-----------------|---------------------------------------|
| 1 | Scrape / research | — | `output/toolLoop/<step-id>/results/…` | — |
| 2 | Collect user input | 1 | form submission | `form/my.form.md` |
| 3 | Process data | 1–2 | `…/results/data.json` | `refs/format.md`, `scripts/process.py` |
| 4 | Final answer | 3 | user report | `refs/format.md` |

**Dependency rules** (bullet list below the table):

- What each step reads and writes.
- Gates (e.g. “do not sort until user confirms search”).
- Sandbox paths the next step must cite.

This table is the **single source of truth** for planning. The **Import** column tells the planner what to put on each todo’s `reference_doc` and `reference_scripts`.

Full example: `~/.teralexi/skills/multi-step-quote-test/skill.md` → **Workflow overview (canonical chain)**.

---

## Step 10 — Test the skill

### 10a. Verify loading

1. Place the folder under `~/.teralexi/skills/<skill-id>/`.
2. Ensure `skill.md` + valid `properties.md` exist.
3. Open teralexi → select the skill in the UI (description should match).
4. Optional: Settings → inspect skill attachments (`refs/`, `scripts/`, `form/`).

### 10b. Smoke-test in chat

| Skill type | Test prompt |
|------------|-------------|
| One-step HITL | `one step hitl test` or include a command in the message |
| Multi-step | `quote for today` |
| Custom | Your trigger phrase from `### Trigger` |

Enable **structured debug** in the sidebar if you want to see Execution Steps, substeps, and artifacts while iterating.

### 10c. Check artifacts

After a run, confirm expected files under the sandbox:

- `output/toolLoop/<step-id>/results/` — per-step results
- `output/results/` — final artifacts (when applicable)
- `scripts/` — copied reference scripts

### 10d. Iterate

Common fixes:

| Problem | Fix |
|---------|-----|
| Skill not in picker | Missing/invalid `properties.md`; folder name reserved; no `skill.md` |
| Wrong tools available | Update `## Tools`; check spelling against `toolSet` |
| Form never appears | Set `form_doc_name` on todo; required fields inferable from message |
| Form blocks forever | Add inference examples; check `FORM_SCHEMA` JSON |
| Planner skips references | Add paths to workflow table **Import** column |
| Script not found | Add script to `reference_scripts` on the todo that runs it |

---

## Step 11 — Checklist before sharing

- [ ] Folder id is lowercase-with-hyphens under `~/.teralexi/skills/`
- [ ] `properties.md` has `name`, `description`, `model`, `provider`
- [ ] `skill.md` has `## Instructions` and `## Tools`
- [ ] Trigger phrases documented
- [ ] `summary.md` and `report.md` present (or `## Summary` / `## Report` in `skill.md`)
- [ ] Workflow table + dependency rules (if multi-step)
- [ ] All `form/`, `refs/`, `scripts/` files linked from instructions
- [ ] Output paths use sandbox conventions (`output/toolLoop/…`, `output/scripts/…`)
- [ ] Tested end-to-end with a real conversation

---

## Quick start: clone the one-step template

Fastest path for a new skill:

```bash
cp -R ~/.teralexi/skills/one-step-hitl-test ~/.teralexi/skills/my-new-skill
```

Then edit:

1. `properties.md` — name, description, color
2. `skill.md` — trigger, workflow table, rules
3. `form/*.form.md` — fields and `FORM_SCHEMA`
4. `scripts/*` — your script logic

---

## How teralexi uses your files (runtime map)

```
User message + selected skill
        │
        ▼
  skill.md Instructions ──► planning (finalGoal, todoList, reference_doc / reference_scripts)
        │
        ▼
  Per-todo execution ──► tools from ## Tools (+ toolSet globals)
        │                 forms from form/ when form_doc_name set
        │                 scripts copied from scripts/
        ▼
  final user message
```

---

## Further reading in this repo

| Topic | Location |
|-------|----------|
| Skill loader | `src/main/skills/skills-directory-loader.ts` |
| Markdown sections | `src/main/skills/skill-markdown.ts`, `llm-constants.ts` |
| Attachments API | `src/main/skills/skill-attachments.ts` |
| Bundled tools | `toolSet/` (repo root) and `~/.teralexi/toolSet/` |
| Planning prompt hints | `src/main/agent/expr/planning-expr.ts` |
