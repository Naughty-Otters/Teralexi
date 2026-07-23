name: Website
description: Build static HTML/CSS/JS websites and landing pages from templates. Requires a selected workspace folder. Use when the user asks to create a website, landing page, portfolio, docs site, or static web page — client-side only, no backend.
model: gemma4
provider: ollama
color: info
enabled: true
refs_dir: refs, templates
scripts_dir: scripts
form_dir: form
allowed_tools: read_file, edit_files, promote_artifact, shell, run_script, run_script_file, web_search, web_scrape, publish_website
