#!/usr/bin/env bash
# Branchwise: Detect branch switch mid-session and re-inject branch memory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

# --- Main ---

COMMON_DIR=$(resolve_common_dir) || { echo '{}'; exit 0; }

PROJECT_HASH=$(get_project_hash "$COMMON_DIR")
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
printf '%s' "$CURRENT_BRANCH" > "$STATE_FILE" 2>/dev/null || true

# Build memory file path — detached HEADs use a subdirectory, not URI encoding
if [[ "$CURRENT_BRANCH" == _detached/* ]]; then
  COMMIT_SHA="${CURRENT_BRANCH#_detached/}"
  MEMORY_FILE="$HOME/.claude/branch-memory/$PROJECT_HASH/branches/_detached/$COMMIT_SHA.md"
else
  SAFE_BRANCH=$(uri_encode "$CURRENT_BRANCH")
  MEMORY_FILE="$HOME/.claude/branch-memory/$PROJECT_HASH/branches/$SAFE_BRANCH.md"
fi

ESCAPED_PREV=$(json_escape "$PREV_BRANCH")
ESCAPED_CURR=$(json_escape "$CURRENT_BRANCH")

if [ -f "$MEMORY_FILE" ]; then
  CONTENT=$(head -200 "$MEMORY_FILE")
  ESCAPED_CONTENT=$(json_escape "$CONTENT")

  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"## Branch Switch: %s -> %s\\nBranch memory has been updated.\\n\\n%s"}}' "$ESCAPED_PREV" "$ESCAPED_CURR" "$ESCAPED_CONTENT"
else
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"## Branch Switch: %s -> %s\\nNo branch memory for %s. Use remember_for_branch to start tracking."}}' "$ESCAPED_PREV" "$ESCAPED_CURR" "$ESCAPED_CURR"
fi

exit 0
