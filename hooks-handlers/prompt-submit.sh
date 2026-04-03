#!/usr/bin/env bash
# Branchwise: Detect branch switch mid-session and re-inject branch memory.
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
SAFE_BRANCH=$(uri_encode "$CURRENT_BRANCH")
MEMORY_FILE="$HOME/.claude/branch-memory/$PROJECT_HASH/branches/$SAFE_BRANCH.md"

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
