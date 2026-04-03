import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  encodeBranchName,
  decodeBranchName,
  projectHash,
  append,
  read,
  list,
  remove,
} from "../src/storage.js";
import { BRANCHWISE_DIR } from "../src/constants.js";

describe("encodeBranchName (URI encoding)", () => {
  it("encodes slashes as %2F", () => {
    expect(encodeBranchName("feat/auth-flow")).toBe("feat%2Fauth-flow");
    expect(encodeBranchName("fix/ui/button")).toBe("fix%2Fui%2Fbutton");
  });

  it("leaves simple names unchanged", () => {
    expect(encodeBranchName("main")).toBe("main");
    expect(encodeBranchName("develop")).toBe("develop");
  });

  it("preserves dashes and dots", () => {
    expect(encodeBranchName("fix-something")).toBe("fix-something");
    expect(encodeBranchName("release.v1")).toBe("release.v1");
  });
});

describe("decodeBranchName", () => {
  it("decodes %2F back to slashes", () => {
    expect(decodeBranchName("feat%2Fauth-flow")).toBe("feat/auth-flow");
  });

  it("roundtrips with encodeBranchName", () => {
    const names = ["main", "feat/auth", "fix/ui/modal/close", "release/v1.0"];
    for (const name of names) {
      expect(decodeBranchName(encodeBranchName(name))).toBe(name);
    }
  });

  it("handles invalid encoded strings gracefully", () => {
    expect(decodeBranchName("not%encoded%right%")).toBe("not%encoded%right%");
  });
});

describe("no branch name collisions", () => {
  it("fix--something and fix/something encode differently", () => {
    const a = encodeBranchName("fix--something");
    const b = encodeBranchName("fix/something");
    expect(a).not.toBe(b);
    expect(a).toBe("fix--something");
    expect(b).toBe("fix%2Fsomething");
  });

  it("branches with mixed slashes and dashes are unique", () => {
    const names = ["a--b/c", "a/b--c", "a/b/c", "a--b--c"];
    const encoded = names.map(encodeBranchName);
    const unique = new Set(encoded);
    expect(unique.size).toBe(names.length);
  });

  it("all encoded names decode back correctly", () => {
    const names = ["a--b/c", "a/b--c", "fix--thing", "fix/thing"];
    for (const name of names) {
      expect(decodeBranchName(encodeBranchName(name))).toBe(name);
    }
  });
});

describe("projectHash", () => {
  it("returns a 12-char hex string", () => {
    const hash = projectHash("/Users/test/repo/.git");
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("produces consistent hashes", () => {
    const a = projectHash("/Users/test/repo/.git");
    const b = projectHash("/Users/test/repo/.git");
    expect(a).toBe(b);
  });

  it("produces different hashes for different paths", () => {
    const a = projectHash("/Users/test/repo-a/.git");
    const b = projectHash("/Users/test/repo-b/.git");
    expect(a).not.toBe(b);
  });
});

describe("storage operations", () => {
  const testHash = "test_" + Date.now().toString(36);
  const testRepo = "/tmp/test-repo";

  afterEach(() => {
    const testDir = join(BRANCHWISE_DIR, testHash);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("append creates a file and read returns content", () => {
    append(testHash, "main", "test entry", testRepo);
    const content = read(testHash, "main");
    expect(content).toContain("test entry");
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/);
  });

  it("append adds multiple entries", () => {
    append(testHash, "main", "first entry", testRepo);
    append(testHash, "main", "second entry", testRepo);
    const content = read(testHash, "main");
    expect(content).toContain("first entry");
    expect(content).toContain("second entry");
  });

  it("read returns null for non-existent branch", () => {
    expect(read(testHash, "nonexistent")).toBeNull();
  });

  it("list returns all branches", () => {
    append(testHash, "main", "entry 1", testRepo);
    append(testHash, "feat/auth", "entry 2", testRepo);
    const branches = list(testHash);
    const names = branches.map((b) => b.branch);
    expect(names).toContain("main");
    expect(names).toContain("feat/auth");
  });

  it("remove deletes branch memory", () => {
    append(testHash, "main", "entry", testRepo);
    expect(read(testHash, "main")).not.toBeNull();
    const removed = remove(testHash, "main");
    expect(removed).toBe(true);
    expect(read(testHash, "main")).toBeNull();
  });

  it("remove returns false for non-existent branch", () => {
    expect(remove(testHash, "nonexistent")).toBe(false);
  });

  it("handles detached HEAD branches", () => {
    append(testHash, "_detached/abc1234", "detached entry", testRepo);
    const content = read(testHash, "_detached/abc1234");
    expect(content).toContain("detached entry");

    const branches = list(testHash);
    const names = branches.map((b) => b.branch);
    expect(names).toContain("_detached/abc1234");
  });

  it("handles branches with slashes correctly (no collision)", () => {
    append(testHash, "fix/something", "slash entry", testRepo);
    append(testHash, "fix--something", "dash entry", testRepo);

    const slashContent = read(testHash, "fix/something");
    const dashContent = read(testHash, "fix--something");

    expect(slashContent).toContain("slash entry");
    expect(slashContent).not.toContain("dash entry");
    expect(dashContent).toContain("dash entry");
    expect(dashContent).not.toContain("slash entry");
  });

  it("trims entries beyond MAX_MEMORY_LINES", () => {
    // Add 210 entries
    for (let i = 0; i < 210; i++) {
      append(testHash, "trim-test", `entry ${i}`, testRepo);
    }
    const content = read(testHash, "trim-test");
    const lines = content!.split("\n").filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(200);
    // Should keep the latest entries
    expect(content).toContain("entry 209");
    expect(content).not.toContain("entry 0");
  });
});
