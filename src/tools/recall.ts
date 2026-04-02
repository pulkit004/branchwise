import { z } from "zod";
import * as storage from "../storage.js";
import { getCurrentBranch, getDetachedCommit, getGitCommonDir, isGitRepo } from "../git.js";

export const schema = z.object({
  branch: z.string().optional().describe("Branch to recall memory for (defaults to current branch)"),
});

export type Input = z.infer<typeof schema>;

export async function execute(input: Input): Promise<string> {
  if (!isGitRepo()) {
    return "Error: Not inside a git repository.";
  }

  const commonDir = getGitCommonDir();
  if (!commonDir) {
    return "Error: Could not determine git repository root.";
  }

  const hash = storage.projectHash(commonDir);
  const branch = input.branch ?? getCurrentBranch() ?? `_detached/${getDetachedCommit() ?? "unknown"}`;

  const content = storage.read(hash, branch);
  if (!content) {
    return `No branch memory found for "${branch}".`;
  }

  return `## Branch Memory: ${branch}\n\n${content}`;
}
