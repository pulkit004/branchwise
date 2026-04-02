import { execSync } from "node:child_process";

function run(cmd: string, cwd?: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

export function getCurrentBranch(cwd?: string): string | null {
  return run("git symbolic-ref --short HEAD", cwd);
}

export function getRepoRoot(cwd?: string): string | null {
  return run("git rev-parse --show-toplevel", cwd);
}

export function getGitCommonDir(cwd?: string): string | null {
  const result = run("git rev-parse --git-common-dir", cwd);
  if (!result) return null;
  // --git-common-dir can return relative paths; resolve against repo root
  if (result.startsWith("/")) return result;
  const root = getRepoRoot(cwd);
  if (!root) return result;
  return run(`cd "${root}" && cd "${result}" && pwd`, cwd);
}

export function getDetachedCommit(cwd?: string): string | null {
  return run("git rev-parse --short HEAD", cwd);
}

export function listLocalBranches(cwd?: string): string[] {
  const result = run("git for-each-ref --format='%(refname:short)' refs/heads/", cwd);
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}

export function isGitRepo(cwd?: string): boolean {
  return run("git rev-parse --is-inside-work-tree", cwd) === "true";
}
