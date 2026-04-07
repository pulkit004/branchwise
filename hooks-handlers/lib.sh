#!/usr/bin/env bash
# Branchwise: Shared utilities for hook handlers.

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  # Escape all remaining ASCII control characters (U+0000–U+001F) per JSON spec
  local out="" i char ord
  for (( i=0; i<${#s}; i++ )); do
    char="${s:$i:1}"
    if [[ "$char" == "'" ]]; then
      out+="'"
      continue
    fi
    ord=$(printf '%d' "'$char" 2>/dev/null || echo 255)
    if (( ord >= 0 && ord < 32 )); then
      out+=$(printf '\\u%04x' "$ord")
    else
      out+="$char"
    fi
  done
  printf '%s' "$out"
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

resolve_common_dir() {
  local common_dir
  common_dir=$(git rev-parse --git-common-dir 2>/dev/null || true)
  if [ -z "$common_dir" ]; then
    return 1
  fi
  if [[ ! "$common_dir" = /* ]]; then
    local repo_root
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
    if [ -n "$repo_root" ]; then
      common_dir=$(cd "$repo_root" && cd "$common_dir" && pwd 2>/dev/null || true)
    fi
  fi
  printf '%s' "$common_dir"
}

get_project_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | cut -c1-12
  else
    printf '%s' "$1" | shasum -a 256 | cut -c1-12
  fi
}
