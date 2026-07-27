#!/bin/bash
# Blocks tool calls that reference credential-looking paths.
payload="${@: -1}"
path=$(echo "$payload" | node -e "
const ctx = JSON.parse(process.argv[1] || '{}');
const input = ctx.toolInput || {};
const p = input.path || input.filePath || input.file || '';
process.stdout.write(String(p));
" "$payload")

if [[ "$path" == *".env"* || "$path" == *"credentials"* ]]; then
  echo "Blocked: tool tried to access a credentials-looking path: $path" >&2
  exit 1
fi
exit 0
