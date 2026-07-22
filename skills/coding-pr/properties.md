name: Coding PR
description: Creates and manages git branches, commits, and pull requests in the user's workspace. Use when the user asks to commit, push, open a PR, or prepare a branch — not for implementing feature code (use Coding skill first).
model: gemma4
provider: ollama
color: warning
enabled: true
max_iterations: 25
group: coding
group_label: Coding
variant: pr
variant_label: PR
group_order: 1
variant_order: 3
allowed_tools: read_file, shell, invoke_agents
