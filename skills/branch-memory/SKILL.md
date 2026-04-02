---
name: branch-memory
description: Persist context per git branch across sessions. Use when encountering decisions, patterns, or debugging findings worth preserving for this specific branch.
---

# Branch Memory

You have branch-scoped memory via the Branchwise MCP tools. Memory saved here is isolated to the current git branch — it won't pollute other branches.

## When to Use

- Architectural decisions specific to this feature branch
- Debugging findings ("this error was caused by X")
- Branch-specific patterns or conventions
- Important context that would be lost between sessions
- When the user says "remember this for this branch"

## When NOT to Use

- General project knowledge (use CLAUDE.md or global MEMORY.md)
- Temporary debugging state that won't matter next session
- Information already captured in code comments or docs

## Tools

- `remember_for_branch` — Save an entry (auto-timestamped)
- `recall_branch_memory` — Read all entries for current/specified branch
- `list_branch_memories` — See all branches with stored memory
- `forget_branch_memory` — Delete a branch's memory
- `gc_branch_memories` — Clean up memories for deleted branches

## Format

Keep entries concise (1-3 lines). Prefix with category:
- `[decision]` — Architectural or design decisions
- `[pattern]` — Patterns or conventions adopted
- `[debug]` — Debugging findings
- `[context]` — Background context
