# Coding interaction modes

Runtime injects mode hints; this ref summarizes behavior for the agent.

| Mode | Behavior |
|------|----------|
| **Normal** | Default. Large tasks may auto-enter explore (read-only) before writes. |
| **Explore** | Read-only tools only until the user approves writes. Map the codebase; produce a plan (files, steps, risks). |
| **Auto** | Do not ask clarifying questions — make reasonable assumptions and execute. |
| **YOLO** | Tools run without per-call approval — work carefully. |
| **Plan mode** | Active after `enter_plan_mode`. File writes go to the plan manifest until `exit_plan_mode`. Reuse `plans/manifest.json` — do not re-scan listed files. |

When explore or plan mode is active, prefer `grep_files`, `glob_files`, `lsp`, and `read_file` before any edit.
