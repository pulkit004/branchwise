import { z } from "zod";
import * as storage from "../storage.js";
import { getCurrentBranch, getDetachedCommit, getGitCommonDir, getRepoRoot, isGitRepo } from "../git.js";

export const schema = z.object({
  entry: z.string().describe("The memory entry to save for this branch"),
  branch: z.string().optional().describe("Target branch (defaults to current branch)"),
});

export type Input = z.infer<typeof schema>;

export async function execute(input: Input): Promise<string> {
  if (!isGitRepo()) {
    return "Error: Not inside a git repository.";
  }

  const commonDir = getGitCommonDir();
  const repoRoot = getRepoRoot();
  if (!commonDir || !repoRoot) {
    return "Error: Could not determine git repository root.";
  }

  const hash = storage.projectHash(commonDir);
  const branch = input.branch ?? getCurrentBranch() ?? `_detached/${getDetachedCommit() ?? "unknown"}`;

  storage.append(hash, branch, input.entry, repoRoot);
  return `Saved to branch memory for "${branch}": ${input.entry}`;
}
