import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BRANCHWISE_DIR } from "../src/constants.js";

// Mock git module so tools don't need a real repo
vi.mock("../src/git.js", () => ({
  isGitRepo: vi.fn(() => true),
  getGitCommonDir: vi.fn(() => "/tmp/mock-repo/.git"),
  getRepoRoot: vi.fn(() => "/tmp/mock-repo"),
  getCurrentBranch: vi.fn(() => "main"),
  getDetachedCommit: vi.fn(() => "abc1234"),
  listLocalBranches: vi.fn(() => ["main"]),
}));

import * as remember from "../src/tools/remember.js";
import * as recall from "../src/tools/recall.js";
import * as listTool from "../src/tools/list.js";
import * as forget from "../src/tools/forget.js";
import * as gcTool from "../src/tools/gc.js";
import { isGitRepo } from "../src/git.js";
import { projectHash } from "../src/storage.js";

const mockHash = projectHash("/tmp/mock-repo/.git");

function cleanup() {
  const dir = join(BRANCHWISE_DIR, mockHash);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
}

describe("remember tool", () => {
  afterEach(cleanup);

  it("saves an entry and returns confirmation", async () => {
    const result = await remember.execute({ entry: "test decision" });
    expect(result).toContain("Saved");
    expect(result).toContain("main");
    expect(result).toContain("test decision");
  });

  it("saves to a specific branch", async () => {
    const result = await remember.execute({ entry: "branch note", branch: "feat/auth" });
    expect(result).toContain("feat/auth");
  });

  it("returns error when not in git repo", async () => {
    vi.mocked(isGitRepo).mockReturnValueOnce(false);
    const result = await remember.execute({ entry: "test" });
    expect(result).toContain("Error");
  });
});

describe("recall tool", () => {
  afterEach(cleanup);

  it("returns 'no memory' for empty branch", async () => {
    const result = await recall.execute({});
    expect(result).toContain("No branch memory");
  });

  it("returns content after remember", async () => {
    await remember.execute({ entry: "important finding" });
    const result = await recall.execute({});
    expect(result).toContain("important finding");
    expect(result).toContain("Branch Memory");
  });

  it("recalls specific branch", async () => {
    await remember.execute({ entry: "auth note", branch: "feat/auth" });
    const result = await recall.execute({ branch: "feat/auth" });
    expect(result).toContain("auth note");
  });
});

describe("list tool", () => {
  afterEach(cleanup);

  it("returns 'no memories' when empty", async () => {
    const result = await listTool.execute();
    expect(result).toContain("No branch memories");
  });

  it("lists branches with entries", async () => {
    await remember.execute({ entry: "note 1" });
    await remember.execute({ entry: "note 2", branch: "dev" });
    const result = await listTool.execute();
    expect(result).toContain("main");
    expect(result).toContain("dev");
    expect(result).toContain("Branch Memories");
  });
});

describe("forget tool", () => {
  afterEach(cleanup);

  it("deletes existing memory", async () => {
    await remember.execute({ entry: "to delete" });
    const result = await forget.execute({ branch: "main" });
    expect(result).toContain("Deleted");

    const recall_result = await recall.execute({});
    expect(recall_result).toContain("No branch memory");
  });

  it("returns 'not found' for nonexistent branch", async () => {
    const result = await forget.execute({ branch: "nonexistent" });
    expect(result).toContain("No branch memory");
  });
});

describe("gc tool", () => {
  afterEach(cleanup);

  it("returns clean when nothing to gc", async () => {
    await remember.execute({ entry: "main note" });
    // listLocalBranches mock returns ["main"], so main won't be gc'd
    const result = await gcTool.execute();
    expect(result).toContain("clean");
  });

  it("removes orphaned branch memories", async () => {
    await remember.execute({ entry: "orphan note", branch: "deleted-branch" });
    // listLocalBranches returns ["main"], so "deleted-branch" is orphaned
    const result = await gcTool.execute();
    expect(result).toContain("deleted-branch");
    expect(result).toContain("Cleaned up");
  });
});
