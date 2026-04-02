#!/usr/bin/env node

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const BRANCHWISE_DIR = join(homedir(), ".claude", "branch-memory");
const MAX_LINES = 200;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function getCurrentBranch() {
  return run("git symbolic-ref --short HEAD");
}

function getCommonDir() {
  const result = run("git rev-parse --git-common-dir");
  if (!result) return null;
  if (result.startsWith("/")) return result;
  const root = run("git rev-parse --show-toplevel");
  if (!root) return result;
  return run(`cd "${root}" && cd "${result}" && pwd`);
}

function hash(str) {
  return createHash("sha256").update(str).digest("hex").slice(0, 12);
}

function encodeBranch(name) {
  return name.replace(/\//g, "--");
}

function decodeBranch(encoded) {
  return encoded.replace(/--/g, "/");
}

function getContext() {
  const commonDir = getCommonDir();
  if (!commonDir) {
    console.error("Error: Not inside a git repository.");
    process.exit(1);
  }
  const projectHash = hash(commonDir);
  const branch = getCurrentBranch();
  return { projectHash, branch, commonDir };
}

function branchFile(projectHash, branch) {
  if (branch.startsWith("_detached/")) {
    const sha = branch.replace("_detached/", "");
    return join(BRANCHWISE_DIR, projectHash, "branches", "_detached", `${sha}.md`);
  }
  return join(BRANCHWISE_DIR, projectHash, "branches", `${encodeBranch(branch)}.md`);
}

// --- Commands ---

function cmdList() {
  const { projectHash } = getContext();
  const dir = join(BRANCHWISE_DIR, projectHash, "branches");
  if (!existsSync(dir)) {
    console.log("No branch memories found.");
    return;
  }

  const entries = [];
  for (const file of readdirSync(dir)) {
    if (file === "_detached") continue;
    if (!file.endsWith(".md")) continue;
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean).length;
    entries.push({ branch: decodeBranch(file.replace(".md", "")), lines, mtime: stat.mtime });
  }

  // Detached
  const detachedDir = join(dir, "_detached");
  if (existsSync(detachedDir)) {
    for (const file of readdirSync(detachedDir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(detachedDir, file);
      const stat = statSync(filePath);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter(Boolean).length;
      entries.push({ branch: `_detached/${file.replace(".md", "")}`, lines, mtime: stat.mtime });
    }
  }

  if (entries.length === 0) {
    console.log("No branch memories found.");
    return;
  }

  entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  console.log("Branch memories:\n");
  for (const e of entries) {
    const age = timeSince(e.mtime);
    console.log(`  ${e.branch} — ${e.lines} entries, updated ${age}`);
  }
}

function cmdShow(targetBranch) {
  const { projectHash, branch } = getContext();
  const b = targetBranch || branch || "main";
  const file = branchFile(projectHash, b);

  if (!existsSync(file)) {
    console.log(`No memory found for branch "${b}".`);
    return;
  }

  console.log(`Branch memory for "${b}":\n`);
  console.log(readFileSync(file, "utf-8"));
}

function cmdAdd(entry) {
  if (!entry) {
    console.error("Usage: branchwise add <entry>");
    process.exit(1);
  }

  const { projectHash, branch, commonDir } = getContext();
  const b = branch || `_detached/${run("git rev-parse --short HEAD") || "unknown"}`;
  const file = branchFile(projectHash, b);

  mkdirSync(dirname(file), { recursive: true });

  // Also ensure meta
  const metaDir = join(BRANCHWISE_DIR, projectHash);
  mkdirSync(join(metaDir, "branches", "_detached"), { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  appendFileSync(file, `- [${timestamp}] ${entry}\n`);

  // Trim
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  if (lines.length > MAX_LINES) {
    writeFileSync(file, lines.slice(lines.length - MAX_LINES).join("\n"));
  }

  console.log(`Saved to "${b}": ${entry}`);
}

function cmdClear(targetBranch) {
  const { projectHash, branch } = getContext();
  const b = targetBranch || branch;
  if (!b) {
    console.error("Could not determine branch. Specify one: branchwise clear <branch>");
    process.exit(1);
  }

  const file = branchFile(projectHash, b);
  if (!existsSync(file)) {
    console.log(`No memory found for branch "${b}".`);
    return;
  }

  unlinkSync(file);
  console.log(`Cleared memory for "${b}".`);
}

function cmdGc() {
  const { projectHash } = getContext();
  const localBranches = run("git for-each-ref --format='%(refname:short)' refs/heads/")?.split("\n").filter(Boolean) || [];
  const dir = join(BRANCHWISE_DIR, projectHash, "branches");
  if (!existsSync(dir)) {
    console.log("Nothing to clean up.");
    return;
  }

  let removed = 0;
  for (const file of readdirSync(dir)) {
    if (file === "_detached" || !file.endsWith(".md")) continue;
    const branch = decodeBranch(file.replace(".md", ""));
    if (!localBranches.includes(branch)) {
      unlinkSync(join(dir, file));
      console.log(`  Removed: ${branch}`);
      removed++;
    }
  }

  console.log(removed ? `\nCleaned up ${removed} orphaned memories.` : "Nothing to clean up.");
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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
  case "list":
    cmdList();
    break;
  case "show":
    cmdShow(rest[0]);
    break;
  case "add":
    cmdAdd(rest.join(" "));
    break;
  case "clear":
    cmdClear(rest[0]);
    break;
  case "gc":
    cmdGc();
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
