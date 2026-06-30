# Sub-agent recipes (invoke_agent)

Use `invoke_agent` for specialized review work instead of improvising.

## Code review (read-only)

- Delegate to a review-focused sub-agent when the user asks for a bug review or PR review.
- Sub-agent should use read-only tools: `read_file`, `grep_files`, `glob_files`, `lsp`, `git_diff`, `git_status`.
- Output: compact findings table — Severity | Location (file:line) | Finding.

## Before creating a PR

- Confirm changes with `git_status` and `git_diff`.
- Run verification (`run_workspace_command`) if tests exist.
- Use `git_create_pr` only when the user asked to open a PR.

For PR-only workflows, suggest the **Coding PR** skill when the user only wants branch/PR operations without feature work.
