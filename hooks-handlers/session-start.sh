#!/usr/bin/env bash
# Branchwise: Load branch-scoped memory at session start.
# Outputs JSON with additionalContext for Claude Code hook system.

set -euo pipefail

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ -z "$BRANCH" ]; then
  COMMIT=$(git rev-parse --short HEAD 2>/dev/null || true)
  if [ -z "$COMMIT" ]; then
    echo '{}'; exit 0
  fi
  BRANCH="_detached/$COMMIT"
fi

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
SAFE_BRANCH=$(echo "$BRANCH" | sed 's|/|--|g')
BASE_DIR="$HOME/.claude/branch-memory/$PROJECT_HASH"
MEMORY_FILE="$BASE_DIR/branches/$SAFE_BRANCH.md"

# Save current branch for switch detection
mkdir -p "$BASE_DIR/branches/_detached"
echo "$BRANCH" > "$BASE_DIR/.current-branch"

if [ -f "$MEMORY_FILE" ]; then
  CONTENT=$(head -200 "$MEMORY_FILE")
  # JSON-escape the content
  ESCAPED=$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" <<< "$CONTENT")
  # Remove surrounding quotes from json.dumps output
  ESCAPED=${ESCAPED:1:${#ESCAPED}-2}

  cat <<EOFJSON
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "## Branchwise Memory (${BRANCH})\nThe following notes are scoped to this git branch. Use the remember_for_branch MCP tool to add new entries.\n\n${ESCAPED}"
  }
}
EOFJSON
else
  cat <<EOFJSON
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "## Branchwise Memory (${BRANCH})\nNo branch-specific memory exists yet. Use the remember_for_branch tool to save notes scoped to this branch."
  }
}
EOFJSON
fi

exit 0
