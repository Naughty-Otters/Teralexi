# Procedural contracts

## run_workspace_command

- Pass **argv arrays** only — e.g. `["npm","test"]`, `["npm","run","lint"]`. No shell strings.
- Long-running commands (`npm test --watch`, dev servers): `background: true`.
- Read stdout/stderr; if checks fail, fix and re-run until pass or report blocker.

## Git

- Prefer structured git tools (`git_status`, `git_diff`, `git_add`, `git_commit`, `git_push`, `git_create_pr`) over raw git in `run_workspace_command`.
- Do not commit or push unless the user asks.
- Commit message: 1–2 sentences focused on **why**, not a file list.

## promote_artifact vs write_file

- Sandbox deliverables under `output/toolLoop/.../results/` → `promote_artifact` (with approval).
- Project source → workspace-relative paths with `edit_file` / `write_file`.

## invoke_agent

- See [sub-agents.md](sub-agents.md) for review and delegation patterns.
