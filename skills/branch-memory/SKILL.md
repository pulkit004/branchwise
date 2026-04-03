---
name: branch-memory
description: Automatically persist important context per git branch.
---

# Branch Memory (Auto-Save)

You have branch-scoped memory via MCP tools. **IMPORTANT: Save proactively. Do NOT wait for the user to ask you to remember something.**

## Auto-Save Rules

After completing any of these, call `remember_for_branch` immediately:
- Made an architectural or design decision
- Found the root cause of a bug
- Discovered a non-obvious pattern or convention in the codebase
- Changed approach based on a failed attempt
- Established a convention for this branch

## Do NOT Save
- Trivial changes (typo, formatting, import order)
- Information already in code comments or docs
- Temporary debugging state
- General project knowledge (use MEMORY.md instead)

## Entry Format
Keep entries to 1 line. Prefix with category:
- `[decision] chose X over Y because Z`
- `[debug] root cause of X was Y in file:line`
- `[pattern] this branch uses X pattern for Y`
- `[context] depends on PR #123 being merged first`

## Tools Available
- `remember_for_branch` — Save an entry (auto-timestamped)
- `recall_branch_memory` — Read all entries for current/specified branch
- `list_branch_memories` — See all branches with stored memory
- `forget_branch_memory` — Delete a branch's memory
- `gc_branch_memories` — Clean up memories for deleted branches
