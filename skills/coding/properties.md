name: Coding
description: Edits, tests, and verifies code in the user's project workspace. Use when fixing bugs, implementing features, refactoring, running tests or lint, or working with git — not for general Q&A or document generation.
model: gemma4
provider: ollama
color: success
enabled: true
max_iterations: 50
group: coding
group_label: Coding
variant: implement
variant_label: Implement
group_order: 1
variant_order: 1
group_primary: true
allowed_tools: read_file, edit_files, lsp, shell, web_search, web_scrape, update_todos, read_todos, invoke_agents, enter_plan_mode, exit_plan_mode, promote_artifact
