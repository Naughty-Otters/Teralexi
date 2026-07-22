# Procedural contracts

## shell

- Pass **argv arrays** only — e.g. `["npm","test"]`, `["rg","-n","pattern","src"]`, `["git","diff"]`. No shell strings.
- Long-running commands (`npm test --watch`, dev servers): `background: true`.
- Read stdout/stderr; if checks fail, fix and re-run until pass or report blocker.
- Use for project tests, grep/glob search, and git inspection (`status` / `diff` / `log`).

## Git

- On **Coding**, inspect with shell: `["git","status"]`, `["git","diff"]`.
- Structured commit/push/PR tools live on the **Coding PR** skill.
- Do not commit or push unless the user asks.
- Commit message: 1–2 sentences focused on **why**, not a file list.

## promote_artifact vs edit_files

- Sandbox deliverables under `output/toolLoop/.../results/` → `promote_artifact` (with approval).
- Project source → `edit_files` (`replace` / `write` / `delete` / `patch`).

## invoke_agents

- See [sub-agents.md](sub-agents.md) for review and delegation patterns.
- One child: `runs: [{ profile | agentId, task }]`. Multiple runs run in parallel and wait together.
