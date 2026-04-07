import { describe, it, expect } from "vitest";
import {
  getCurrentBranch,
  getRepoRoot,
  getGitCommonDir,
  getDetachedCommit,
  listLocalBranches,
  isGitRepo,
} from "../src/git.js";

describe("git helpers (live repo)", () => {
  it("isGitRepo returns true in a git repo", () => {
    expect(isGitRepo()).toBe(true);
  });

  it("getCurrentBranch returns a string or null", () => {
    const branch = getCurrentBranch();
    // Could be null if detached HEAD, but in normal dev it's a string
    if (branch !== null) {
      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    }
  });

  it("getRepoRoot returns an absolute path", () => {
    const root = getRepoRoot();
    expect(root).not.toBeNull();
    expect(root!.startsWith("/")).toBe(true);
  });

  it("getGitCommonDir returns an absolute path", () => {
    const dir = getGitCommonDir();
    expect(dir).not.toBeNull();
    expect(dir!.startsWith("/")).toBe(true);
  });

  it("getDetachedCommit returns a short SHA", () => {
    const sha = getDetachedCommit();
    expect(sha).not.toBeNull();
    expect(sha).toMatch(/^[0-9a-f]{7,12}$/);
  });

  it("listLocalBranches returns an array of strings", () => {
    const branches = listLocalBranches();
    expect(Array.isArray(branches)).toBe(true);
    for (const b of branches) {
      expect(typeof b).toBe("string");
    }
  });

  it("isGitRepo returns false for non-git dir", () => {
    expect(isGitRepo("/tmp")).toBe(false);
  });

  it("getCurrentBranch returns null for non-git dir", () => {
    expect(getCurrentBranch("/tmp")).toBeNull();
  });

  it("getRepoRoot returns null for non-git dir", () => {
    expect(getRepoRoot("/tmp")).toBeNull();
  });

  it("getGitCommonDir returns null for non-git dir", () => {
    expect(getGitCommonDir("/tmp")).toBeNull();
  });

  it("listLocalBranches returns empty for non-git dir", () => {
    expect(listLocalBranches("/tmp")).toEqual([]);
  });
});
