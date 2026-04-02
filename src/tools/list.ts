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
  const branches = storage.list(hash);

  if (branches.length === 0) {
    return "No branch memories found for this repository.";
  }

  const lines = branches.map((b) => {
    const age = timeSince(b.lastModified);
    return `- **${b.branch}** — ${b.lines} entries, updated ${age}`;
  });

  return `## Branch Memories\n\n${lines.join("\n")}`;
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
