#!/bin/bash

tsc

for agent_dir in src/agents/*/; do
  agent_name=$(basename "$agent_dir")
  dest_dir="dist/agents/$agent_name"

  # Copy any .md files (prompts)
  if ls "$agent_dir"*.md 1>/dev/null 2>&1; then
    cp "$agent_dir"*.md "$dest_dir/"
  fi
done

echo "Copied prompt.md files to dist/"
