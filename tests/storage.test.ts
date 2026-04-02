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

describe("encodeBranchName", () => {
  it("encodes slashes as double dashes", () => {
    expect(encodeBranchName("feat/auth-flow")).toBe("feat--auth-flow");
    expect(encodeBranchName("fix/ui/button")).toBe("fix--ui--button");
  });

  it("leaves simple names unchanged", () => {
    expect(encodeBranchName("main")).toBe("main");
    expect(encodeBranchName("develop")).toBe("develop");
  });
});

describe("decodeBranchName", () => {
  it("decodes double dashes back to slashes", () => {
    expect(decodeBranchName("feat--auth-flow")).toBe("feat/auth-flow");
    expect(decodeBranchName("fix--ui--button")).toBe("fix/ui/button");
  });

  it("roundtrips with encodeBranchName", () => {
    const names = ["main", "feat/auth", "fix/ui/modal/close", "release/v1.0"];
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
  // These tests use the real storage functions which write to BRANCHWISE_DIR.
  // We'll test read/append/list/remove using a known hash and verify the files.
  // Since the functions use the global BRANCHWISE_DIR constant, we test behavior
  // by using a unique hash that won't collide.

  const testHash = "test_" + Date.now().toString(36);
  const testRepo = "/tmp/test-repo";

  afterEach(() => {
    // Clean up test files
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
});
