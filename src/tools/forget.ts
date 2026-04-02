import { z } from "zod";
import * as storage from "../storage.js";
import { getGitCommonDir, isGitRepo } from "../git.js";

export const schema = z.object({
  branch: z.string().describe("Branch name whose memory to delete"),
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
  const removed = storage.remove(hash, input.branch);

  if (removed) {
    return `Deleted branch memory for "${input.branch}".`;
  }
  return `No branch memory found for "${input.branch}".`;
}
