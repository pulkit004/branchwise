import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  renameSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import {
  BRANCHWISE_DIR,
  MAX_MEMORY_LINES,
  META_FILE,
  CURRENT_BRANCH_FILE,
  BRANCHES_DIR,
  DETACHED_DIR,
  BRANCH_SEPARATOR,
} from "./constants.js";
import { getGitCommonDir, listLocalBranches } from "./git.js";

// --- Branch name encoding ---

export function encodeBranchName(name: string): string {
  return name.replace(/\//g, BRANCH_SEPARATOR);
}

export function decodeBranchName(encoded: string): string {
  return encoded.replace(new RegExp(BRANCH_SEPARATOR, "g"), "/");
}

// --- Project hashing ---

export function projectHash(gitCommonDir: string): string {
  return createHash("sha256").update(gitCommonDir).digest("hex").slice(0, 12);
}

export function getProjectHash(cwd?: string): string | null {
  const commonDir = getGitCommonDir(cwd);
  if (!commonDir) return null;
  return projectHash(commonDir);
}

// --- Path helpers ---

function projectDir(hash: string): string {
  return join(BRANCHWISE_DIR, hash);
}

function branchesDir(hash: string): string {
  return join(projectDir(hash), BRANCHES_DIR);
}

function branchFile(hash: string, branch: string): string {
  if (branch.startsWith("_detached/")) {
    const sha = branch.replace("_detached/", "");
    return join(branchesDir(hash), DETACHED_DIR, `${sha}.md`);
  }
  return join(branchesDir(hash), `${encodeBranchName(branch)}.md`);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// --- Meta management ---

function ensureMeta(hash: string, repoPath: string): void {
  const dir = projectDir(hash);
  ensureDir(dir);
  ensureDir(join(dir, BRANCHES_DIR));
  ensureDir(join(dir, BRANCHES_DIR, DETACHED_DIR));

  const metaPath = join(dir, META_FILE);
  if (!existsSync(metaPath)) {
    writeFileSync(metaPath, JSON.stringify({ repoPath, createdAt: new Date().toISOString() }, null, 2));
  }
}

// --- Current branch state ---

export function readCurrentBranch(hash: string): string | null {
  const file = join(projectDir(hash), CURRENT_BRANCH_FILE);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf-8").trim();
}

export function writeCurrentBranch(hash: string, branch: string): void {
  ensureDir(projectDir(hash));
  writeFileSync(join(projectDir(hash), CURRENT_BRANCH_FILE), branch);
}

// --- Core storage operations ---

export interface BranchInfo {
  branch: string;
  lines: number;
  lastModified: Date;
}

export function read(hash: string, branch: string): string | null {
  const file = branchFile(hash, branch);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf-8");
}

export function append(hash: string, branch: string, entry: string, repoPath: string): void {
  ensureMeta(hash, repoPath);
  const file = branchFile(hash, branch);
  ensureDir(dirname(file));

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const line = `- [${timestamp}] ${entry}\n`;

  appendFileSync(file, line);

  // Trim to MAX_MEMORY_LINES
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  if (lines.length > MAX_MEMORY_LINES) {
    const trimmed = lines.slice(lines.length - MAX_MEMORY_LINES).join("\n");
    writeFileSync(file, trimmed);
  }
}

export function list(hash: string): BranchInfo[] {
  const dir = branchesDir(hash);
  if (!existsSync(dir)) return [];

  const results: BranchInfo[] = [];

  // Regular branch files
  for (const file of readdirSync(dir)) {
    if (file === DETACHED_DIR) continue;
    if (!file.endsWith(".md")) continue;
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    const content = readFileSync(filePath, "utf-8");
    results.push({
      branch: decodeBranchName(file.replace(".md", "")),
      lines: content.split("\n").filter(Boolean).length,
      lastModified: stat.mtime,
    });
  }

  // Detached HEAD files
  const detachedDir = join(dir, DETACHED_DIR);
  if (existsSync(detachedDir)) {
    for (const file of readdirSync(detachedDir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(detachedDir, file);
      const stat = statSync(filePath);
      const content = readFileSync(filePath, "utf-8");
      results.push({
        branch: `_detached/${file.replace(".md", "")}`,
        lines: content.split("\n").filter(Boolean).length,
        lastModified: stat.mtime,
      });
    }
  }

  return results.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

export function remove(hash: string, branch: string): boolean {
  const file = branchFile(hash, branch);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

export function gc(hash: string, cwd?: string): string[] {
  const branches = listLocalBranches(cwd);
  const memories = list(hash);
  const removed: string[] = [];

  for (const mem of memories) {
    if (mem.branch.startsWith("_detached/")) continue; // skip detached
    if (!branches.includes(mem.branch)) {
      remove(hash, mem.branch);
      removed.push(mem.branch);
    }
  }

  return removed;
}
