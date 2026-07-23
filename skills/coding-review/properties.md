name: Coding Review
description: Read-only code and diff review in the user's workspace. Use when reviewing pull requests, examining changes, auditing quality or security, or asking "what does this code do" — not for implementing fixes.
model: gemma4
provider: ollama
color: info
enabled: true
max_iterations: 30
group: coding
group_label: Coding
variant: review
variant_label: Review
group_order: 1
variant_order: 2
allowed_tools: read_file, lsp, shell, invoke_agents
