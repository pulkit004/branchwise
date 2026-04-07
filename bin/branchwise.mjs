#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Import from compiled dist/ — single source of truth
const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");

const { encodeBranchName, decodeBranchName, projectHash, append, read, list, remove, gc } = await import(join(dist, "storage.js"));
const { getCurrentBranch, getGitCommonDir, getDetachedCommit, isGitRepo } = await import(join(dist, "git.js"));

// --- Helpers ---

function getContext() {
  if (!isGitRepo()) {
    console.error("Error: not inside a git repository.");
    process.exit(1);
  }
  const commonDir = getGitCommonDir();
  if (!commonDir) {
    console.error("Error: could not determine git repository root.");
    process.exit(1);
  }
  const hash = projectHash(commonDir);
  const branch = getCurrentBranch() ?? `_detached/${getDetachedCommit() ?? "unknown"}`;
  return { hash, branch };
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// --- Commands ---

function cmdList() {
  const { hash } = getContext();
  const branches = list(hash);

  if (branches.length === 0) {
    console.log("No branch memories found.");
    return;
  }

  console.log("Branch memories:\n");
  for (const b of branches) {
    console.log(`  ${b.branch} — ${b.lines} entries, updated ${timeSince(b.lastModified)}`);
  }
}

function cmdShow(targetBranch) {
  const { hash, branch } = getContext();
  const b = targetBranch || branch;
  const content = read(hash, b);

  if (!content) {
    console.log(`No memory found for branch "${b}".`);
    return;
  }

  console.log(`Branch memory for "${b}":\n`);
  console.log(content);
}

function cmdAdd(entry) {
  if (!entry) {
    console.error("Usage: branchwise add <entry>");
    process.exit(1);
  }

  const { hash, branch } = getContext();
  const commonDir = getGitCommonDir();
  append(hash, branch, entry, commonDir);
  console.log(`Saved to "${branch}": ${entry}`);
}

function cmdClear(targetBranch) {
  const { hash, branch } = getContext();
  const b = targetBranch || branch;

  if (remove(hash, b)) {
    console.log(`Cleared memory for "${b}".`);
  } else {
    console.log(`No memory found for branch "${b}".`);
  }
}

function cmdGc() {
  const { hash } = getContext();
  const removed = gc(hash);

  if (removed.length === 0) {
    console.log("Nothing to clean up.");
  } else {
    for (const b of removed) {
      console.log(`  Removed: ${b}`);
    }
    console.log(`\nCleaned up ${removed.length} orphaned memories.`);
  }
}

function printHelp() {
  console.log(`
branchwise — Branch-scoped memory for Claude Code

Usage:
  branchwise list              List all branches with memory
  branchwise show [branch]     Show memory for a branch (default: current)
  branchwise add <entry>       Add an entry to current branch memory
  branchwise clear [branch]    Clear memory for a branch
  branchwise gc                Remove memories for deleted branches
  branchwise help              Show this help
`);
}

// --- Main ---

const [, , command, ...rest] = process.argv;

switch (command) {
  case "list":    cmdList(); break;
  case "show":    cmdShow(rest[0]); break;
  case "add":     cmdAdd(rest.join(" ")); break;
  case "clear":   cmdClear(rest[0]); break;
  case "gc":      cmdGc(); break;
  case "help":
  case "--help":
  case "-h":
  case undefined: printHelp(); break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
