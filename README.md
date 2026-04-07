# branchwise

Branch-scoped memory and sessions for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Isolate conversation context per git branch — no more memory pollution across features, bugfixes, and experiments.

## Problem

Claude Code's built-in memory is scoped per repository, not per branch. When you work across multiple branches, debugging notes from a bugfix bleed into feature work, and architectural decisions from one feature get incorrectly applied to another. And `claude --continue` resumes the most recent session globally — not the one from your current branch.

**Branchwise** gives each git branch its own memory and session tracking. Memory auto-loads when you start a session, switches when you change branches, and `--continue` resumes the right branch's conversation.

## How It Works

```
┌─────────────────────────────────────────────────┐
│  Claude Code Session                            │
│                                                 │
│  SessionStart hook ──► Load memory + track session
│  UserPromptSubmit  ──► Detect branch switch     │
│  MCP Tools         ──► Read/write branch memory │
│  SKILL.md          ──► Auto-save decisions       │
│  bw wrapper        ──► Resume correct session   │
└─────────────────────────────────────────────────┘
         │
         ▼
~/.claude/branch-memory/<project-hash>/
  .sessions/
    main                  ← session ID (plain text)
    feat%2Fauth-flow
  branches/
    main.md               ← memory entries (markdown)
    feat%2Fauth-flow.md
    _detached/
      abc1234.md
```

Three layers:
1. **Hooks** — Auto-load memory at session start; detect mid-session branch switches; track session IDs
2. **MCP Server** — 5 tools Claude can call to read/write/manage branch memory
3. **CLI + `bw` wrapper** — Manual operations and branch-aware `--continue`

Plus **auto-save**: Claude proactively saves important decisions, debug findings, and patterns without you asking.

## Install

```bash
npm install -g branchwise
```

Then add MCP + hooks to Claude Code (copy-paste each block):

**1. MCP server** — add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "branchwise": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "branchwise"]
    }
  }
}
```

**2. Hooks** — add to `~/.claude/settings.json`:

```json
{
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

That's it — branch-scoped memory works now. Start a Claude Code session and it auto-loads memory for your current branch.

**3. Optional: branch-scoped sessions** — add to `~/.zshrc` or `~/.bashrc`:

```bash
alias claude='bw'
```

This makes `claude --continue` resume the correct branch's session instead of the most recent global one. All other flags pass through untouched. If there's no stored session for the current branch, it falls back to normal `--continue`.

## Usage

### Automatic (zero effort)

Just start a Claude Code session. Branchwise automatically:
- Loads memory for your current branch
- Tracks the session ID for later `--continue`
- Detects when you `git checkout` to another branch mid-session
- Injects the new branch's memory into context
- Saves important decisions and findings as you work

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
- [2025-03-15 14:30] [decision] Use Zod for validation
- [2025-03-15 15:00] [debug] Auth middleware requires session token in cookie, not header
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
branchwise session           # Show stored session ID for current branch
branchwise session --all     # Show all branch → session mappings
branchwise session --clear   # Remove session mapping for current branch
```

## Storage

```
~/.claude/branch-memory/
  a1b2c3d4e5f6/              # SHA-256 hash of git common dir (first 12 chars)
    _meta.json                # { repoPath, createdAt }
    .current-branch           # Tracks branch for switch detection
    .sessions/
      main                    # Session ID for branch (plain text)
      feat%2Fauth-flow        # URI-encoded branch name
      _detached_abc1234       # Detached HEAD session
    branches/
      main.md                 # One markdown file per branch
      feat%2Fauth-flow.md     # "/" URI-encoded as "%2F" (fully reversible)
      _detached/
        abc1234.md            # Detached HEAD keyed by commit SHA
```

- Max 200 lines per branch (oldest entries trimmed on overflow)
- Human-readable markdown files
- Atomic writes with temp file + rename (safe for concurrent access)
- Lock file protection to prevent trim race conditions
- Symlink-safe: all file operations validate paths and skip symlinks
- Separate from Claude Code internals (`~/.claude/projects/`)
- Worktree-safe: uses `git rev-parse --git-common-dir` to normalize

## Security

- **Path traversal**: Branch names encoded with `encodeURIComponent`; detached HEAD SHAs sanitized with `basename()`
- **Symlink attacks**: All reads/writes/deletes use `lstatSync` to detect and skip symlinks; `realpathSync` validates paths stay within storage directory
- **Argument injection**: Session IDs validated against `^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$` — must start with alphanumeric, preventing `--flag` injection
- **Shell injection**: No user input interpolated into shell commands; git helpers use `execSync` with hardcoded commands and `cwd` option
- **JSON injection**: Hook output escapes all control characters (U+0000–U+001F) per JSON spec
- **Input validation**: Zod schemas enforce max lengths (10K for entries, 500 for branch names)
- **Race conditions**: Atomic rename for file trimming; exclusive lock file prevents concurrent trim corruption

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Detached HEAD | Keyed by short commit SHA under `_detached/` |
| Branch rename | Memory stays under old name; `branchwise gc` detects orphans |
| Branch delete | Memory persists on disk; `branchwise gc` cleans up |
| Git worktrees | All worktrees of same repo share memory (normalized via git common dir) |
| No git repo | Gracefully no-ops |
| Detached HEAD GC | Auto-cleaned after 30 days |
| No stored session | `bw` falls back to normal `claude --continue` |
| Non-git directory | `bw` passes through to `claude` unchanged |

## Development

```bash
git clone https://github.com/pulkit004/branchwise.git
cd branchwise
npm install
npm run build
npm test
```

## License

MIT
