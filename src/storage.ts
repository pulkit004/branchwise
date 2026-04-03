import { createHash, randomUUID } from "node:crypto";
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
  DETACHED_MAX_AGE_MS,
} from "./constants.js";
import { getGitCommonDir, listLocalBranches } from "./git.js";

// --- Branch name encoding (URI-safe, fully reversible) ---

export function encodeBranchName(name: string): string {
  return encodeURIComponent(name);
}

export function decodeBranchName(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded; // fallback for legacy `--` encoded files
  }
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
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    throw new Error(`Branchwise: failed to create directory ${dir}: ${err}`);
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
    try {
      writeFileSync(metaPath, JSON.stringify({ repoPath, createdAt: new Date().toISOString() }, null, 2));
    } catch {
      // non-fatal — meta is informational
    }
  }
}

// --- Current branch state ---

export function readCurrentBranch(hash: string): string | null {
  const file = join(projectDir(hash), CURRENT_BRANCH_FILE);
  try {
    if (!existsSync(file)) return null;
    return readFileSync(file, "utf-8").trim();
  } catch {
    return null;
  }
}

export function writeCurrentBranch(hash: string, branch: string): void {
  try {
    ensureDir(projectDir(hash));
    writeFileSync(join(projectDir(hash), CURRENT_BRANCH_FILE), branch);
  } catch {
    // non-fatal — state file is best-effort
  }
}

// --- Core storage operations ---

export interface BranchInfo {
  branch: string;
  lines: number;
  lastModified: Date;
}

export function read(hash: string, branch: string): string | null {
  const file = branchFile(hash, branch);
  try {
    if (!existsSync(file)) return null;
    return readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

export function append(hash: string, branch: string, entry: string, repoPath: string): void {
  ensureMeta(hash, repoPath);
  const file = branchFile(hash, branch);
  ensureDir(dirname(file));

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const line = `- [${timestamp}] ${entry}\n`;

  try {
    appendFileSync(file, line);

    // Trim to MAX_MEMORY_LINES using atomic rename
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > MAX_MEMORY_LINES) {
      const trimmed = lines.slice(-MAX_MEMORY_LINES).join("\n") + "\n";
      const tmp = file + "." + randomUUID().slice(0, 8);
      writeFileSync(tmp, trimmed);
      renameSync(tmp, file); // atomic on same filesystem
    }
  } catch (err) {
    throw new Error(`Branchwise: failed to write to ${file}: ${err}`);
  }
}

export function list(hash: string): BranchInfo[] {
  const dir = branchesDir(hash);
  if (!existsSync(dir)) return [];

  const results: BranchInfo[] = [];

  try {
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
  } catch {
    // partial results are fine
  }

  return results.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

export function remove(hash: string, branch: string): boolean {
  const file = branchFile(hash, branch);
  try {
    if (!existsSync(file)) return false;
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

export function gc(hash: string, cwd?: string): string[] {
  const branches = listLocalBranches(cwd);
  const memories = list(hash);
  const removed: string[] = [];
  const now = Date.now();

  for (const mem of memories) {
    // GC detached HEAD memories older than 30 days
    if (mem.branch.startsWith("_detached/")) {
      if (now - mem.lastModified.getTime() > DETACHED_MAX_AGE_MS) {
        remove(hash, mem.branch);
        removed.push(mem.branch);
      }
      continue;
    }

    if (!branches.includes(mem.branch)) {
      remove(hash, mem.branch);
      removed.push(mem.branch);
    }
  }

  return removed;
}
