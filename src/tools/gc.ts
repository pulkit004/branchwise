import * as storage from "../storage.js";
import { getGitCommonDir, isGitRepo } from "../git.js";

export async function execute(): Promise<string> {
  if (!isGitRepo()) {
    return "Error: Not inside a git repository.";
  }

  const commonDir = getGitCommonDir();
  if (!commonDir) {
    return "Error: Could not determine git repository root.";
  }

  const hash = storage.projectHash(commonDir);
  const removed = storage.gc(hash);

  if (removed.length === 0) {
    return "No orphaned branch memories found. Everything is clean.";
  }

  return `Cleaned up ${removed.length} orphaned branch memories:\n${removed.map((b) => `- ${b}`).join("\n")}`;
}
