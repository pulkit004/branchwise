#!/usr/bin/env bash
# Branchwise: Load branch-scoped memory at session start.
# Pure bash — no python3 dependency.

set -euo pipefail

# --- Helpers ---

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

uri_encode() {
  local string="$1" i char hex
  local out=""
  for (( i=0; i<${#string}; i++ )); do
    char="${string:$i:1}"
    case "$char" in
      [a-zA-Z0-9._~-]) out+="$char" ;;
      *) hex=$(printf '%%%02X' "'$char"); out+="$hex" ;;
    esac
  done
  printf '%s' "$out"
}

# --- Main ---

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
    COMMON_DIR=$(cd "$REPO_ROOT" && cd "$COMMON_DIR" && pwd 2>/dev/null || true)
  fi
fi

PROJECT_HASH=$(printf '%s' "$COMMON_DIR" | shasum -a 256 | cut -c1-12)
SAFE_BRANCH=$(uri_encode "$BRANCH")
BASE_DIR="$HOME/.claude/branch-memory/$PROJECT_HASH"
MEMORY_FILE="$BASE_DIR/branches/$SAFE_BRANCH.md"

# Save current branch for switch detection
mkdir -p "$BASE_DIR/branches/_detached" 2>/dev/null || true
printf '%s' "$BRANCH" > "$BASE_DIR/.current-branch" 2>/dev/null || true

ESCAPED_BRANCH=$(json_escape "$BRANCH")

if [ -f "$MEMORY_FILE" ]; then
  CONTENT=$(head -200 "$MEMORY_FILE")
  ESCAPED_CONTENT=$(json_escape "$CONTENT")

  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"## Branchwise Memory (%s)\\nThe following notes are scoped to this git branch. Use the remember_for_branch MCP tool to add new entries.\\n\\n%s"}}' "$ESCAPED_BRANCH" "$ESCAPED_CONTENT"
else
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"## Branchwise Memory (%s)\\nNo branch-specific memory exists yet. Use the remember_for_branch tool to save notes scoped to this branch."}}' "$ESCAPED_BRANCH"
fi

exit 0
