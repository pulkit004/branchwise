# branchwise

Branch-scoped memory for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Isolate conversation context per git branch — no more memory pollution across features, bugfixes, and experiments.

## Problem

Claude Code's built-in memory is scoped per repository, not per branch. When you work across multiple branches, debugging notes from a bugfix bleed into feature work, and architectural decisions from one feature get incorrectly applied to another.

**Branchwise** gives each git branch its own memory that auto-loads when you start a session and switches automatically when you change branches.

## How It Works

```
┌─────────────────────────────────────────────────┐
│  Claude Code Session                            │
│                                                 │
│  SessionStart hook ──► Load branch memory       │
│  UserPromptSubmit  ──► Detect branch switch     │
│  MCP Tools         ──► Read/write branch memory │
└─────────────────────────────────────────────────┘
         │
         ▼
~/.claude/branch-memory/<project-hash>/
  branches/
    main.md
    feat--auth-flow.md
    fix--null-pointer.md
```

Three layers:
1. **Hooks** — Auto-load memory at session start; detect mid-session branch switches
2. **MCP Server** — 5 tools Claude can call to read/write/manage branch memory
3. **CLI** — Manual operations outside Claude Code

## Install

```bash
npm install -g branchwise
```

### Configure Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "branchwise": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "branchwise"]
    }
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash $(npm root -g)/branchwise/hooks-handlers/session-start.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash $(npm root -g)/branchwise/hooks-handlers/prompt-submit.sh",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

## Usage

### Automatic (zero effort)

Just start a Claude Code session. Branchwise automatically:
- Loads memory for your current branch
- Detects when you `git checkout` to another branch mid-session
- Injects the new branch's memory into context

### In conversation

Ask Claude to remember things for the current branch:

```
> Remember that we decided to use Zod for validation in this feature
> [Claude calls remember_for_branch]
Saved to branch memory for "feat/auth": [decision] Use Zod for validation
```

Claude can also read branch memory:

```
> What do we know about this branch?
> [Claude calls recall_branch_memory]
## Branch Memory: feat/auth
- [2024-03-15 14:30] [decision] Use Zod for validation
- [2024-03-15 15:00] [debug] Auth middleware requires session token in cookie, not header
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `remember_for_branch` | Save a memory entry for the current branch |
| `recall_branch_memory` | Read all entries for a branch |
| `list_branch_memories` | List all branches with stored memory |
| `forget_branch_memory` | Delete a branch's memory |
| `gc_branch_memories` | Clean up memories for deleted branches |

### CLI

```bash
branchwise list              # All branches with memory
branchwise show [branch]     # Show memory (default: current branch)
branchwise add "entry"       # Add entry to current branch
branchwise clear [branch]    # Clear a branch's memory
branchwise gc                # Remove memories for deleted branches
```

## Storage

Memory files live at `~/.claude/branch-memory/<project-hash>/branches/`:

```
~/.claude/branch-memory/
  a1b2c3d4e5f6/              # SHA-256 hash of git common dir (first 12 chars)
    _meta.json                # { repoPath, createdAt }
    .current-branch           # Tracks branch for switch detection
    branches/
      main.md                 # One markdown file per branch
      feat--auth-flow.md      # "/" in branch names encoded as "--"
      _detached/
        abc1234.md            # Detached HEAD keyed by commit SHA
```

- Max 200 lines per branch (oldest entries trimmed on overflow)
- Human-readable markdown files
- Separate from Claude Code internals (`~/.claude/projects/`)
- Worktree-safe: uses `git rev-parse --git-common-dir` to normalize

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Detached HEAD | Keyed by short commit SHA under `_detached/` |
| Branch rename | Memory stays under old name; `branchwise gc` detects orphans |
| Branch delete | Memory persists on disk; `branchwise gc` cleans up |
| Git worktrees | All worktrees of same repo share memory (normalized via git common dir) |
| No git repo | Gracefully no-ops |

## Development

```bash
git clone https://github.com/pulsevortex/branchwise.git
cd branchwise
npm install
npm run build
npm test
```

## License

MIT
