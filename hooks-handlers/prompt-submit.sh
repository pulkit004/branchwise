#!/usr/bin/env bash
# Branchwise: Detect branch switch mid-session and re-inject branch memory.

set -euo pipefail

COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || true)
if [ -z "$COMMON_DIR" ]; then
  echo '{}'; exit 0
fi

# Resolve relative paths
if [[ ! "$COMMON_DIR" = /* ]]; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$REPO_ROOT" ]; then
    COMMON_DIR=$(cd "$REPO_ROOT" && cd "$COMMON_DIR" && pwd)
  fi
fi

PROJECT_HASH=$(echo -n "$COMMON_DIR" | shasum -a 256 | cut -c1-12)
STATE_FILE="$HOME/.claude/branch-memory/$PROJECT_HASH/.current-branch"

if [ ! -f "$STATE_FILE" ]; then
  echo '{}'; exit 0
fi

CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || true)
PREV_BRANCH=$(cat "$STATE_FILE" 2>/dev/null || true)

if [ "$CURRENT_BRANCH" = "$PREV_BRANCH" ] || [ -z "$CURRENT_BRANCH" ]; then
  echo '{}'; exit 0
fi

# Branch changed — update state and inject new memory
echo "$CURRENT_BRANCH" > "$STATE_FILE"
SAFE_BRANCH=$(echo "$CURRENT_BRANCH" | sed 's|/|--|g')
MEMORY_FILE="$HOME/.claude/branch-memory/$PROJECT_HASH/branches/$SAFE_BRANCH.md"

if [ -f "$MEMORY_FILE" ]; then
  CONTENT=$(head -200 "$MEMORY_FILE")
  ESCAPED=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" <<< "$CONTENT")
  ESCAPED=${ESCAPED:1:${#ESCAPED}-2}

  cat <<EOFJSON
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "## Branch Switch: ${PREV_BRANCH} -> ${CURRENT_BRANCH}\nBranch memory has been updated.\n\n${ESCAPED}"
  }
}
EOFJSON
else
  cat <<EOFJSON
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "## Branch Switch: ${PREV_BRANCH} -> ${CURRENT_BRANCH}\nNo branch memory for ${CURRENT_BRANCH}. Use remember_for_branch to start tracking."
  }
}
EOFJSON
fi

exit 0
