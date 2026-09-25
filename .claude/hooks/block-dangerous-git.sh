#!/bin/bash
# PreToolUse hook: blocks dangerous git commands before Claude runs them.
# Based on git-guardrails-claude-code by Matt Pocock (MIT), github.com/mattpocock/skills.
# Project change: pushing a task branch (NN_name) is allowed, so Claude can open PRs.
# Everything else that pushes or destroys work is blocked.
# Exit code 2 = block. The stderr message is shown to Claude.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

block() {
  echo "BLOCKED: '$COMMAND' matches dangerous pattern '$1'. The developer has prevented you from doing this. Ask them to run it." >&2
  exit 2
}

DANGEROUS_PATTERNS=(
  "reset --hard"
  "git clean -f"
  "git clean -fd"
  "git branch -D"
  "git branch --delete --force"
  "git checkout \."
  "git checkout -- \."
  "git restore \."
  "push --force"
  "push -f"
  "--force-with-lease"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE -- "$pattern"; then
    block "$pattern"
  fi
done

# Every `push` in the command must be `push [-u] origin NN_task_branch`.
if echo "$COMMAND" | grep -qE '\bpush\b'; then
  while read -r segment; do
    if ! echo "$segment" | grep -qE '^push( -u| --set-upstream)? origin [0-9]{2}_[a-z0-9_]+( [0-9]?>.*)?$'; then
      block "git push (only 'git push -u origin NN_task_branch' is allowed)"
    fi
  done < <(echo "$COMMAND" | grep -oE '\bpush\b[^;&|]*' | sed -E 's/[[:space:]]+$//')
fi

exit 0
