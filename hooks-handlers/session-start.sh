#!/usr/bin/env bash
# Branchwise: Load branch-scoped memory at session start.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

# --- Read hook input (contains session metadata) ---

HOOK_INPUT=$(cat 2>/dev/null | tr -d '\n' || true)
SESSION_ID=$(printf '%s' "$HOOK_INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

# Validate session ID format (must start with alphanumeric, prevents flag injection)
if [[ -n "$SESSION_ID" ]] && ! [[ "$SESSION_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  SESSION_ID=""
fi

# --- Main ---

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ -z "$BRANCH" ]; then
  COMMIT=$(git rev-parse --short HEAD 2>/dev/null || true)
  COMMIT="${COMMIT##*/}"  # sanitize: basename only
  if [ -z "$COMMIT" ]; then
    echo '{}'; exit 0
  fi
  BRANCH="_detached/$COMMIT"
fi

COMMON_DIR=$(resolve_common_dir) || { echo '{}'; exit 0; }

PROJECT_HASH=$(get_project_hash "$COMMON_DIR")
BASE_DIR="$HOME/.claude/branch-memory/$PROJECT_HASH"

# Build memory file path — detached HEADs use a subdirectory, not URI encoding
if [[ "$BRANCH" == _detached/* ]]; then
  COMMIT_SHA="${BRANCH#_detached/}"
  MEMORY_FILE="$BASE_DIR/branches/_detached/$COMMIT_SHA.md"
else
  SAFE_BRANCH=$(uri_encode "$BRANCH")
  MEMORY_FILE="$BASE_DIR/branches/$SAFE_BRANCH.md"
fi

# Save current branch for switch detection
mkdir -p "$BASE_DIR/branches/_detached" 2>/dev/null || true
printf '%s' "$BRANCH" > "$BASE_DIR/.current-branch" 2>/dev/null || true

# Store session-to-branch mapping for branch-scoped session resume
if [ -n "$SESSION_ID" ]; then
  SESSIONS_DIR="$BASE_DIR/.sessions"
  mkdir -p "$SESSIONS_DIR" 2>/dev/null || true

  if [[ "$BRANCH" == _detached/* ]]; then
    SESSION_FILE="$SESSIONS_DIR/_detached_${BRANCH#_detached/}"
  else
    ENCODED_BRANCH=$(uri_encode "$BRANCH")
    SESSION_FILE="$SESSIONS_DIR/$ENCODED_BRANCH"
  fi

  printf '%s' "$SESSION_ID" > "$SESSION_FILE" 2>/dev/null || true
fi

ESCAPED_BRANCH=$(json_escape "$BRANCH")

if [ -f "$MEMORY_FILE" ]; then
  CONTENT=$(head -200 "$MEMORY_FILE")
  ESCAPED_CONTENT=$(json_escape "$CONTENT")

  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"## Branchwise Memory (%s)\\nThe following notes are scoped to this git branch. Use the remember_for_branch MCP tool to add new entries.\\n\\n%s"}}' "$ESCAPED_BRANCH" "$ESCAPED_CONTENT"
else
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"## Branchwise Memory (%s)\\nNo branch-specific memory exists yet. Use the remember_for_branch tool to save notes scoped to this branch."}}' "$ESCAPED_BRANCH"
fi

exit 0
